import { authenticatedFetch as fetch, ownerId } from '../testSupport/auth.js'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { before, after, beforeEach, test } from 'node:test'
import app from '../app.js'
import Document from '../models/Document.js'

const id = '507f1f77bcf86cd799439011'
const stored = {
  _id: id, originalName: 'report.pdf', fileName: 'internal.pdf', size: 1234,
  mimeType: 'application/pdf', createdAt: new Date('2026-09-01T10:00:00Z'),
  extractedText: 'Full stored document text',
  analysis: { summary: 'Saved summary', keyPoints: ['A key point'], documentType: 'Report',
    entities: ['Example'], analyzedAt: new Date('2026-09-01T10:01:00Z') },
}
let server
let base
let records
let findMock
let sortMock

before(async () => {
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}/api/documents`
})
after(async () => { await new Promise(resolve => server.close(resolve)) })
beforeEach(context => {
  records = [stored]
  const query = {
    sort(order) {
      records = [...records].sort((a, b) => {
        for (const [field, direction] of Object.entries(order)) {
          if (a[field] < b[field]) return -direction
          if (a[field] > b[field]) return direction
        }
        return 0
      })
      return this
    },
    async lean() { return records },
  }
  sortMock = context.mock.method(query, 'sort')
  findMock = context.mock.method(Document, 'find', () => query)
  context.mock.method(Document, 'findOne', async () => stored)
})

async function get(path = '') {
  const response = await fetch(`${base}${path}`)
  return { status: response.status, body: await response.json() }
}

test('list returns only history metadata and requests a limited database projection', async () => {
  const { status, body } = await get()
  assert.equal(status, 200)
  assert.deepEqual(body, [{ id, originalName: stored.originalName, size: stored.size,
    createdAt: stored.createdAt.toISOString(), analysis: { documentType: 'Report' }, analyzed: true }])
  assert.deepEqual(findMock.mock.calls[0].arguments, [{ owner: ownerId }, 'originalName size createdAt analysis.documentType'])
  assert.ok(!JSON.stringify(body).includes(stored.extractedText))
})

test('list sorts newest first with deterministic ordering for equal dates', async () => {
  const newer = { ...stored, _id: '507f1f77bcf86cd799439012', createdAt: new Date('2026-09-02T10:00:00Z') }
  const tied = { ...newer, _id: '507f1f77bcf86cd799439013' }
  records = [stored, newer, tied]
  const { body } = await get()
  assert.deepEqual(body.map(item => item.id), [tied._id, newer._id, id])
  assert.deepEqual(sortMock.mock.calls[0].arguments, [{ createdAt: -1, _id: -1 }])
})

test('empty history returns an empty array', async () => {
  records = []
  assert.deepEqual(await get(), { status: 200, body: [] })
})

test('unanalyzed documents omit analysis and report analyzed false', async () => {
  records = [{ ...stored, analysis: undefined }]
  const { body } = await get()
  assert.equal(body[0].analyzed, false)
  assert.equal('analysis' in body[0], false)
})

test('fetches full stored document and analysis without internal fields', async () => {
  const { status, body } = await get(`/${id}`)
  assert.equal(status, 200)
  assert.deepEqual(body, JSON.parse(JSON.stringify({ id, originalName: stored.originalName,
    size: stored.size, mimeType: stored.mimeType, createdAt: stored.createdAt,
    extractedText: stored.extractedText, analysis: stored.analysis })))
  assert.deepEqual(Document.findOne.mock.calls[0].arguments, [{ _id: id, owner: ownerId }])
})

test('fetching an unanalyzed document returns null analysis', async () => {
  Document.findOne.mock.mockImplementation(async () => ({ ...stored, analysis: undefined }))
  assert.equal((await get(`/${id}`)).body.analysis, null)
})

test('invalid IDs are rejected before accessing the database', async () => {
  for (const invalid of ['invalid', 'abcdefghijkl', 'z'.repeat(24), '1'.repeat(23), '1'.repeat(25)]) {
    assert.deepEqual(await get(`/${invalid}`), {
      status: 400, body: { status: 'error', message: 'Invalid document ID.' },
    })
  }
  assert.equal(Document.findOne.mock.callCount(), 0)
})

test('missing document returns 404', async () => {
  Document.findOne.mock.mockImplementation(async () => null)
  assert.deepEqual(await get(`/${id}`), {
    status: 404, body: { status: 'error', message: 'Document not found.' },
  })
})

test('list database errors return a safe 503 response', async () => {
  findMock.mock.mockImplementation(() => ({ sort() { return this }, async lean() { throw new Error('private database details') } }))
  assert.deepEqual(await get(), {
    status: 503, body: { status: 'error', message: 'Unable to load document history. Please try again.' },
  })
})

test('document database errors return a safe 503 response', async () => {
  Document.findOne.mock.mockImplementation(async () => { throw new Error('private database details') })
  assert.deepEqual(await get(`/${id}`), {
    status: 503, body: { status: 'error', message: 'Unable to load the document. Please try again.' },
  })
})
