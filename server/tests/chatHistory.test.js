import assert from 'node:assert/strict'
import { once } from 'node:events'
import { before, after, beforeEach, test } from 'node:test'
import { Models } from '@google/genai'
import app from '../app.js'
import Document from '../models/Document.js'
import { env } from '../config/env.js'

const id = '507f1f77bcf86cd799439011'
let server, base, originalKey, stored, update, gemini
before(async () => {
  originalKey = env.geminiApiKey
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}/api/documents`
})
after(async () => {
  env.geminiApiKey = originalKey
  await new Promise(resolve => server.close(resolve))
})
beforeEach(context => {
  env.geminiApiKey = 'test-key-never-sent'
  stored = { extractedText: 'Annual revenue was 42 million dollars.', chatHistory: [] }
  context.mock.method(Document, 'findById', (documentId, projection) => projection
    ? { async lean() { return stored } } : Promise.resolve(stored))
  update = context.mock.method(Document, 'updateOne', async (filter, change) => {
    stored.chatHistory.push(...change.$push.chatHistory.$each)
    return { matchedCount: 1 }
  })
  gemini = context.mock.method(Models.prototype, 'generateContentInternal', async () => ({
    text: JSON.stringify({ answer: 'Revenue was 42 million dollars.' }), candidates: [{ finishReason: 'STOP' }],
  }))
})
async function history(documentId = id) {
  const result = await fetch(`${base}/${documentId}/chat`)
  return { status: result.status, body: await result.json() }
}
async function ask(question = 'What was revenue?') {
  const result = await fetch(`${base}/${id}/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }),
  })
  return { status: result.status, body: await result.json() }
}

test('new and legacy documents have empty chat history', async () => {
  assert.deepEqual(await history(), { status: 200, body: [] })
  delete stored.chatHistory
  assert.deepEqual(await history(), { status: 200, body: [] })
  assert.deepEqual(Document.findById.mock.calls[0].arguments, [id, 'chatHistory'])
})

test('successful exchange saves both messages atomically with source previews', async () => {
  const result = await ask('  What was revenue?  ')
  assert.equal(result.status, 200)
  assert.equal(update.mock.callCount(), 1)
  const [filter, change, options] = update.mock.calls[0].arguments
  assert.deepEqual(filter, { _id: id })
  assert.deepEqual(options, { runValidators: true })
  assert.deepEqual(change.$push.chatHistory.$each.map(message => message.role), ['user', 'assistant'])
  const saved = await history()
  assert.equal(saved.status, 200)
  assert.equal(saved.body[0].content, 'What was revenue?')
  assert.equal(saved.body[1].content, result.body.answer)
  assert.deepEqual(saved.body[1].sources, result.body.sources)
  assert.ok(saved.body.every(message => Number.isFinite(Date.parse(message.createdAt))))
})

test('multiple exchanges preserve chronological question and answer order', async () => {
  await ask('What was revenue?')
  await ask('Describe annual revenue')
  const { body } = await history()
  assert.deepEqual(body.map(message => message.role), ['user', 'assistant', 'user', 'assistant'])
  assert.equal(body[0].content, 'What was revenue?')
  assert.equal(body[2].content, 'Describe annual revenue')
  assert.ok(Date.parse(body[0].createdAt) <= Date.parse(body[2].createdAt))
})

test('unavailable-context answer is saved without calling Gemini', async () => {
  assert.equal((await ask('Describe photosynthesis')).status, 200)
  assert.equal(gemini.mock.callCount(), 0)
  assert.equal((await history()).body.length, 2)
})

test('invalid document ID is rejected before reading the database', async () => {
  for (const invalid of ['invalid', 'g'.repeat(24), 'a'.repeat(12)]) {
    assert.equal((await history(invalid)).status, 400)
  }
  assert.equal(Document.findById.mock.callCount(), 0)
})

test('missing document returns 404', async () => {
  stored = null
  assert.equal((await history()).status, 404)
})

test('malformed stored chat data is rejected', async () => {
  const valid = { role: 'user', content: 'Hello', createdAt: new Date() }
  for (const malformed of [null, {}, [null], [{ ...valid, role: 'system' }],
    [{ ...valid, content: '' }], [{ ...valid, content: 42 }],
    [{ ...valid, createdAt: 'bad date' }], [{ ...valid, sources: [{ chunkIndex: -1, preview: 'text' }] }]]) {
    stored.chatHistory = malformed
    assert.equal((await history()).status, 422)
  }
})

test('Gemini failure does not save either message', async () => {
  gemini.mock.mockImplementation(async () => { throw new Error('private provider error') })
  assert.equal((await ask()).status, 502)
  assert.equal(update.mock.callCount(), 0)
  assert.deepEqual(stored.chatHistory, [])
})

test('database write failure returns a safe error without a partial exchange', async () => {
  update.mock.mockImplementation(async () => { throw new Error('private database details') })
  assert.deepEqual(await ask(), { status: 503,
    body: { status: 'error', message: 'Unable to save chat history. Please try again.' } })
  assert.deepEqual(stored.chatHistory, [])
})

test('document removed during answer generation returns 404', async () => {
  update.mock.mockImplementation(async () => ({ matchedCount: 0 }))
  assert.equal((await ask()).status, 404)
})

test('database history read failure returns a safe error', async () => {
  Document.findById.mock.mockImplementation(() => ({ async lean() { throw new Error('private database details') } }))
  assert.deepEqual(await history(), { status: 503,
    body: { status: 'error', message: 'Unable to load chat history. Please try again.' } })
})

test('model rejects malformed chat roles, content, dates and sources', async () => {
  for (const message of [
    { role: 'system', content: 'Hello' }, { role: 'user', content: '  ' },
    { role: 'assistant', content: 'Hello', createdAt: 'invalid' },
    { role: 'assistant', content: 'Hello', sources: [{ chunkIndex: -1, preview: 'text' }] },
  ]) {
    const document = new Document({ originalName: 'test.pdf', fileName: 'test.pdf',
      mimeType: 'application/pdf', size: 10, extractedText: 'Text', chatHistory: [message] })
    await assert.rejects(document.validate(), { name: 'ValidationError' })
  }
})
