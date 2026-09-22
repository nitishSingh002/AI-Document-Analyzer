import { vector, mockEmbeddings } from '../testSupport/embeddings.js'
import { authenticatedFetch as fetch, ownerId } from '../testSupport/auth.js'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { before, after, beforeEach, test } from 'node:test'
import { Models } from '@google/genai'
import app from '../app.js'
import Document from '../models/Document.js'
import { env } from '../config/env.js'
import { splitText } from '../services/retrievalService.js'

const id = '507f1f77bcf86cd799439011'
const text = 'The annual revenue was 42 million dollars. The company operates in London.'
let server, base, originalKey, gemini
const response = answer => ({ text: JSON.stringify({ answer }), candidates: [{ finishReason: 'STOP' }] })

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
  mockEmbeddings(context)
  context.mock.method(Document, 'findOne', async () => ({ extractedText: text, chunks: [{ chunkIndex: 0, text, embedding: vector() }] }))
  context.mock.method(Document, 'updateOne', async () => ({ matchedCount: 1 }))
  gemini = context.mock.method(Models.prototype, 'generateContentInternal', async () => response('Annual revenue was 42 million dollars.'))
})
async function ask(question = 'What was annual revenue?', documentId = id) {
  const result = await fetch(`${base}/${documentId}/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }),
  })
  return { status: result.status, body: await result.json() }
}

test('successful question uses saved text and returns answer with bounded source previews', async () => {
  const result = await ask()
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { answer: 'Annual revenue was 42 million dollars.', sources: [{ chunkIndex: 0, preview: text }] })
  const request = gemini.mock.calls[0].arguments[0]
  assert.deepEqual(JSON.parse(request.contents[0].parts[0].text), {
    question: 'What was annual revenue?', context: [{ chunkIndex: 0, text }],
  })
  assert.match(request.config.systemInstruction, /only the provided document context/)
  assert.match(request.config.systemInstruction, /not available in the document/)
  assert.equal(request.config.responseMimeType, 'application/json')
  assert.equal(request.config.responseJsonSchema.additionalProperties, false)
})
test('invalid ID fails before database and Gemini', async () => {
  assert.equal((await ask('revenue', 'invalid')).status, 400)
  assert.equal(Document.findOne.mock.callCount(), 0)
  assert.equal(gemini.mock.callCount(), 0)
})
test('document not found', async () => {
  Document.findOne.mock.mockImplementation(async () => null)
  assert.equal((await ask()).status, 404)
  assert.equal(gemini.mock.callCount(), 0)
})
for (const [label, question] of [['empty', ''], ['whitespace-only', ' \n\t '], ['missing', undefined], ['non-string', {}], ['too long', 'a'.repeat(2001)]]) {
  test(`${label} question is rejected`, async () => {
    // Undefined uses a direct request because ask() supplies a default question.
    const result = question === undefined
      ? await fetch(`${base}/${id}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      : await ask(question)
    assert.equal(result.status, 400)
    assert.equal(Document.findOne.mock.callCount(), 0)
    assert.equal(gemini.mock.callCount(), 0)
  })
}
test('missing or blank document text', async () => {
  for (const extractedText of [undefined, '', ' \n ']) {
    Document.findOne.mock.mockImplementation(async () => ({ extractedText }))
    assert.equal((await ask()).status, 422)
  }
  assert.equal(gemini.mock.callCount(), 0)
})
test('questions without keyword overlap still use semantic context', async () => {
  for (const question of ['Describe earnings', 'what is it?']) {
    assert.equal((await ask(question)).status, 200)
  }
  assert.equal(gemini.mock.callCount(), 2)
})

test('Gemini can report unsupported information despite keyword overlap', async () => {
  gemini.mock.mockImplementation(async () => response('This information is not available in the document.'))
  assert.equal((await ask('What is the projected revenue?')).body.answer, 'This information is not available in the document.')
})
test('Gemini failure never exposes provider text in responses or logs', async context => {
  const logs = context.mock.method(console, 'error', () => {})
  gemini.mock.mockImplementation(async () => { throw new Error(`private ${text} ${env.geminiApiKey}`) })
  const result = await ask()
  assert.equal(result.status, 502)
  assert.equal(Document.updateOne.mock.callCount(), 0)
  const output = JSON.stringify([result.body, logs.mock.calls])
  for (const secret of ['private', text, env.geminiApiKey]) assert.ok(!output.includes(secret))
})
test('malformed, empty, blocked and incomplete answers fail safely', async () => {
  for (const value of [
    response(''), response('  '), response(42), response('x'.repeat(12001)),
    { text: '{broken', candidates: [{ finishReason: 'STOP' }] },
    { text: '{}', candidates: [{ finishReason: 'STOP' }] },
    { text: '{"answer":"ok","extra":true}', candidates: [{ finishReason: 'STOP' }] },
    { ...response('partial'), candidates: [{ finishReason: 'MAX_TOKENS' }] },
    { ...response('blocked'), promptFeedback: { blockReason: 'SAFETY' } }, {},
  ]) {
    gemini.mock.mockImplementation(async () => value)
    assert.equal((await ask()).status, 502)
  }
  assert.equal(Document.updateOne.mock.callCount(), 0)
})
test('database failure and missing server key are handled', async () => {
  env.geminiApiKey = ''
  assert.equal((await ask()).status, 503)
  Document.findOne.mock.mockImplementation(async () => { throw new Error('private database') })
  const result = await ask()
  assert.equal(result.status, 503)
  assert.ok(!JSON.stringify(result.body).includes('private'))
  assert.equal(gemini.mock.callCount(), 0)
})
test('chunks overlap by 40 words and cover the end without redundant trailing chunks', () => {
  const words = Array.from({ length: 401 }, (_, index) => `word${index}`)
  const chunks = splitText(words.join(' '))
  assert.equal(chunks.length, 3)
  assert.deepEqual(chunks[0].text.split(' ').slice(-40), chunks[1].text.split(' ').slice(0, 40))
  assert.ok(chunks[2].text.endsWith('word400'))
  assert.deepEqual(splitText('   '), [])
})
test('only retrieved chunks reach Gemini and previews are at most 300 characters', async () => {
  Document.findOne.mock.mockImplementation(async () => ({ extractedText: `${'unrelated '.repeat(440)} ${'revenue '.repeat(300)}` }))
  const result = await ask()
  const payload = JSON.parse(gemini.mock.calls[0].arguments[0].contents[0].parts[0].text)
  assert.ok(payload.context.length <= 4)
  assert.ok(payload.context.every(chunk => !('embedding' in chunk)))
  assert.ok(result.body.sources.every(source => source.preview.length <= 300))
})
