import { authenticatedFetch, ownerId } from '../testSupport/auth.js'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { before, after, beforeEach, test } from 'node:test'
import app from '../app.js'
import Document from '../models/Document.js'

const id = '507f1f77bcf86cd799439011'
let server, base, records, remove, rename
before(async () => {
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}/api/documents`
})
after(async () => { await new Promise(resolve => server.close(resolve)) })
beforeEach(context => {
  records = [{ _id: id, owner: ownerId, originalName: 'original.pdf', fileName: 'internal.pdf',
    size: 100, createdAt: new Date(), extractedText: 'Saved text',
    analysis: { documentType: 'Report', summary: 'Saved summary' },
    chatHistory: [{ role: 'user', content: 'Question', createdAt: new Date() }] }]
  remove = context.mock.method(Document, 'deleteOne', async filter => {
    assert.deepEqual(filter, { _id: id, owner: ownerId })
    const index = records.findIndex(record => record._id === filter._id && record.owner === filter.owner)
    if (index === -1) return { deletedCount: 0 }
    records.splice(index, 1)
    return { deletedCount: 1 }
  })
  rename = context.mock.method(Document, 'findOneAndUpdate', async (filter, update, options) => {
    assert.deepEqual(filter, { _id: id, owner: ownerId })
    assert.equal(options.runValidators, true)
    assert.equal(options.returnDocument, 'after')
    assert.deepEqual(Object.keys(update.$set), ['displayName'])
    const record = records.find(item => item._id === filter._id && item.owner === filter.owner)
    if (!record) return null
    Object.assign(record, update.$set)
    return record
  })
  context.mock.method(Document, 'find', filter => ({ sort() { return this },
    async lean() { return records.filter(record => record.owner === filter.owner) } }))
  context.mock.method(Document, 'findOne', async filter => records.find(record => record._id === filter._id && record.owner === filter.owner) || null)
})
async function request(method, documentId = id, body) {
  const response = await authenticatedFetch(`${base}/${documentId}`, { method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  return { status: response.status, body: response.status === 204 ? null : await response.json() }
}

test('owner deletes the complete document including embedded analysis and chat', async () => {
  assert.deepEqual(await request('DELETE'), { status: 204, body: null })
  assert.equal(records.length, 0)
  assert.equal((await request('GET')).status, 404)
  assert.equal(remove.mock.callCount(), 1)
})
test('history list updates after deletion', async () => {
  assert.equal((await (await authenticatedFetch(base)).json()).length, 1)
  await request('DELETE')
  assert.deepEqual(await (await authenticatedFetch(base)).json(), [])
})
test('invalid delete IDs fail before database access', async () => {
  for (const invalid of ['invalid', 'a'.repeat(12), 'z'.repeat(24)]) assert.equal((await request('DELETE', invalid)).status, 400)
  assert.equal(remove.mock.callCount(), 0)
})
test('missing document returns 404 on delete', async () => {
  records = []
  assert.equal((await request('DELETE')).status, 404)
})
test('another user and ownerless documents cannot be deleted', async () => {
  for (const owner of ['607f1f77bcf86cd799439099', undefined]) {
    records[0].owner = owner
    assert.deepEqual(await request('DELETE'), { status: 404, body: { status: 'error', message: 'Document not found.' } })
    assert.equal(records.length, 1)
  }
})
test('delete database failures are safe and leave UI-retry semantics intact', async () => {
  remove.mock.mockImplementation(async () => { throw new Error('private database details') })
  assert.deepEqual(await request('DELETE'), { status: 503, body: { status: 'error', message: 'Unable to delete the document. Please try again.' } })
  assert.equal(records.length, 1)
})
test('rename changes only displayName and appears on list and fetch', async () => {
  const original = structuredClone(records[0])
  const result = await request('PATCH', id, { name: '  New display name  ' })
  assert.deepEqual(result, { status: 200, body: { id, originalName: 'original.pdf', displayName: 'New display name' } })
  assert.deepEqual(records[0], { ...original, displayName: 'New display name' })
  assert.equal((await request('GET')).body.displayName, 'New display name')
  assert.equal((await (await authenticatedFetch(base)).json())[0].displayName, 'New display name')
})
test('rename rejects malformed bodies and unexpected fields', async () => {
  for (const body of [null, {}, { name: '' }, { name: '   ' }, { name: 42 }, { name: 'x'.repeat(201) },
    { name: { $set: 'bad' } }, { name: 'valid', owner: ownerId }, { name: 'valid', originalName: 'changed.pdf' }]) {
    assert.equal((await request('PATCH', id, body)).status, 400)
  }
  assert.equal(rename.mock.callCount(), 0)
})
test('rename rejects invalid ID before database access', async () => {
  assert.equal((await request('PATCH', 'invalid', { name: 'New name' })).status, 400)
  assert.equal(rename.mock.callCount(), 0)
})
test('missing document returns 404 on rename', async () => {
  records = []
  assert.equal((await request('PATCH', id, { name: 'New name' })).status, 404)
})
test('rename cannot access another user or ownerless document', async () => {
  for (const owner of ['607f1f77bcf86cd799439099', undefined]) {
    records[0].owner = owner
    assert.equal((await request('PATCH', id, { name: 'New name' })).status, 404)
    assert.equal(records[0].displayName, undefined)
  }
})
test('rename database failures do not expose database details', async () => {
  rename.mock.mockImplementation(async () => { throw new Error('private database details') })
  assert.deepEqual(await request('PATCH', id, { name: 'New name' }), { status: 503,
    body: { status: 'error', message: 'Unable to rename the document. Please try again.' } })
})
test('delete and rename require authentication', async () => {
  for (const method of ['DELETE', 'PATCH']) {
    const response = await fetch(`${base}/${id}`, { method })
    assert.equal(response.status, 401)
  }
  assert.equal(remove.mock.callCount(), 0)
  assert.equal(rename.mock.callCount(), 0)
})
