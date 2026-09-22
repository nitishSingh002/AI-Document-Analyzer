import assert from 'node:assert/strict'
import { beforeEach, afterEach, test } from 'node:test'
import timers from 'node:timers/promises'
import { env } from '../config/env.js'
import { generateEmbedding, generateEmbeddings } from '../services/embeddingService.js'
import { cosineSimilarity, retrieveContext, splitText, embedDocument } from '../services/retrievalService.js'
import { askDocument } from '../services/documentService.js'
import Document from '../models/Document.js'
import { Models } from '@google/genai'
import { vector, mockEmbeddings } from '../testSupport/embeddings.js'

const id = '507f1f77bcf86cd799439011', owner = '507f1f77bcf86cd799439012'
let originalEnv, embed, sleep, logs, writes, stored, answer
beforeEach(context => {
  originalEnv = { ...env }
  env.geminiApiKey = 'private-test-key'
  env.geminiEmbeddingModel = 'gemini-embedding-2'
  embed = mockEmbeddings(context)
  sleep = context.mock.method(timers, 'setTimeout', async () => {})
  logs = context.mock.method(console, 'info', () => {})
  stored = { extractedText: 'Employees receive paid leave.', chunks: [] }
  context.mock.method(Document, 'findOne', async () => stored)
  writes = context.mock.method(Document, 'updateOne', async (filter, update) => {
    if (update.$set) Object.assign(stored, update.$set)
    return { matchedCount: 1 }
  })
  answer = context.mock.method(Models.prototype, 'generateContentInternal', async () => ({
    text: JSON.stringify({ answer: 'Employees receive paid leave.' }), candidates: [{ finishReason: 'STOP' }],
  }))
})
afterEach(() => Object.assign(env, originalEnv))

test('embeds text independently, preserves order, and requests 768 dimensions', async () => {
  embed.mock.mockImplementation(async request => ({ embeddings: [{ values: vector(request.contents[0].parts[0].text.endsWith('second') ? 2 : 1) }] }))
  assert.deepEqual(await generateEmbeddings(['first', 'second']), [vector(), vector(2)])
  assert.deepEqual(embed.mock.calls.map(call => ({ ...call.arguments[0], contents: call.arguments[0].contents[0].parts[0].text })), [
    { model: 'gemini-embedding-2', contents: 'title: none | text: first', config: { outputDimensionality: 768 } },
    { model: 'gemini-embedding-2', contents: 'title: none | text: second', config: { outputDimensionality: 768 } },
  ])
})

test('question uses question-answering retrieval prefix', async () => {
  await generateEmbedding('  Can I take time off?  ', 'question')
  assert.equal(embed.mock.calls[0].arguments[0].contents[0].parts[0].text, 'task: question answering | query: Can I take time off?')
})

test('cosine similarity handles magnitude, orthogonality, and opposite vectors', () => {
  assert.equal(cosineSimilarity([2, 0], [5, 0]), 1)
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0)
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1)
  for (const bad of [[], [0, 0], [NaN, 1], [Infinity, 0], [1]]) {
    assert.throws(() => cosineSimilarity([1, 0], bad), { status: 422 })
  }
})

test('retrieval selects correct top four by meaning vectors without keyword overlap', () => {
  const chunks = [0.1, 0.8, -1, 0.6, 1, 0.3].map((x, chunkIndex) => ({
    chunkIndex, text: `Passage ${chunkIndex}`, embedding: vector(x, Math.sqrt(1 - x * x)),
  }))
  assert.deepEqual(retrieveContext(chunks, vector()).map(chunk => chunk.chunkIndex), [4, 1, 3, 5])
  assert.ok(retrieveContext(chunks, vector()).every(chunk => !('embedding' in chunk)))
  assert.throws(() => retrieveContext([], vector()), { status: 422 })
})

test('chunking bounds long tokens and preserves overlapping context', async () => {
  const words = Array.from({ length: 401 }, (_, i) => `word${i}`)
  const chunks = splitText(words.join(' '))
  assert.equal(chunks.length, 3)
  assert.deepEqual(chunks[0].text.split(' ').slice(-40), chunks[1].text.split(' ').slice(0, 40))
  assert.ok(chunks.at(-1).text.endsWith('word400'))
  assert.ok(splitText('a'.repeat(50000)).every(chunk => chunk.text.length <= 22219))
  assert.deepEqual(splitText('  '), [])
  await assert.rejects(() => embedDocument(''), { status: 422 })
})

test('legacy chunks are persisted once, then only one question vector per ask is generated', async () => {
  await askDocument(id, 'Can I take time off?', owner)
  assert.equal(embed.mock.callCount(), 2)
  assert.equal(writes.mock.calls[0].arguments[0].owner, owner)
  assert.deepEqual(stored.chunks[0].embedding, vector())
  assert.equal(stored.embeddingModel, 'gemini-embedding-2')
  await askDocument(id, 'How about vacation?', owner)
  assert.equal(embed.mock.callCount(), 3)
  assert.equal(writes.mock.calls.filter(call => call.arguments[1].$set).length, 1)
  assert.equal(writes.mock.calls.filter(call => call.arguments[1].$push).length, 2)
})

test('source previews and answer context match semantic ranking', async () => {
  stored.chunks = Array.from({ length: 6 }, (_, chunkIndex) => ({ chunkIndex,
    text: `Paid leave policy ${chunkIndex} ` + 'x'.repeat(400), embedding: vector(chunkIndex + 1, 1) }))
  const result = await askDocument(id, 'Can I take time off?', owner)
  assert.equal(embed.mock.callCount(), 1)
  assert.deepEqual(result.sources.map(source => source.chunkIndex), [5, 4, 3, 2])
  assert.ok(result.sources.every(source => source.preview.length === 300))
  const context = JSON.parse(answer.mock.calls[0].arguments[0].contents[0].parts[0].text).context
  assert.deepEqual(context.map(chunk => chunk.chunkIndex), [5, 4, 3, 2])
  assert.ok(context.every(chunk => !chunk.embedding))
})

for (const status of [400, 401, 403]) {
  test(`permanent embedding error ${status} is never retried`, async () => {
    embed.mock.mockImplementation(async () => { throw Object.assign(new Error('secret contents'), { status }) })
    await assert.rejects(() => generateEmbedding('private document'), { status: 502 })
    assert.equal(embed.mock.callCount(), 1)
    assert.equal(sleep.mock.callCount(), 0)
    assert.ok(!JSON.stringify(logs.mock.calls).includes('private document'))
  })
}

test('transient errors use bounded exponential backoff without answer-model fallback', async () => {
  let attempts = 0
  embed.mock.mockImplementation(async () => {
    if (attempts < 3) throw Object.assign(new Error('private'), { status: [429, 500, 503][attempts++] })
    return { embeddings: [{ values: vector() }] }
  })
  await generateEmbedding('text')
  assert.equal(embed.mock.callCount(), 4)
  for (const [i, call] of sleep.mock.calls.entries()) {
    assert.ok(call.arguments[0] >= 800 * 2 ** i && call.arguments[0] <= 1200 * 2 ** i)
  }
  assert.ok(embed.mock.calls.every(call => call.arguments[0].model === 'gemini-embedding-2'))
})

test('exhausted retries stop and do not save chat history', async () => {
  embed.mock.mockImplementation(async () => { throw Object.assign(new Error('private'), { status: 503 }) })
  await assert.rejects(() => askDocument(id, 'leave?', owner), { status: 502 })
  assert.equal(embed.mock.callCount(), 4)
  assert.equal(writes.mock.callCount(), 0)
  assert.equal(answer.mock.callCount(), 0)
})

test('malformed embedding responses fail without retry', async () => {
  for (const response of [{}, { embeddings: [] }, { embeddings: [{ values: [1] }] },
    { embeddings: [{ values: vector(0) }] }, { embeddings: [{ values: vector(NaN) }] },
    { embeddings: [{ values: vector(Infinity) }] }, { embeddings: [{ values: vector('1') }] },
    { embeddings: [{ values: vector() }, { values: vector() }] }]) {
    embed.mock.mockImplementation(async () => response)
    await assert.rejects(() => generateEmbedding('text'), { status: 502 })
  }
  assert.equal(sleep.mock.callCount(), 0)
})

test('empty inputs and missing configuration fail before provider requests', async () => {
  await assert.rejects(() => generateEmbedding('  '), { status: 422 })
  await assert.rejects(() => generateEmbeddings([]), { status: 422 })
  env.geminiEmbeddingModel = ''
  await assert.rejects(() => generateEmbedding('text'), { status: 503 })
  env.geminiEmbeddingModel = 'gemini-embedding-2'
  env.geminiApiKey = ''
  await assert.rejects(() => generateEmbedding('text'), { status: 503 })
  assert.equal(embed.mock.callCount(), 0)
})

test('lazy embedding database failure prevents answering and chat writes', async () => {
  writes.mock.mockImplementation(async () => { throw new Error('private database') })
  await assert.rejects(() => askDocument(id, 'leave?', owner), {
    status: 503, message: 'Unable to save document embeddings. Please try again.',
  })
  assert.equal(answer.mock.callCount(), 0)
  assert.equal(writes.mock.calls.filter(call => call.arguments[1].$push).length, 0)
})

test('question embedding failure does not save chat history', async () => {
  stored.chunks = [{ chunkIndex: 0, text: stored.extractedText, embedding: vector() }]
  embed.mock.mockImplementation(async () => { throw new Error('private') })
  await assert.rejects(() => askDocument(id, 'leave?', owner), { status: 502 })
  assert.equal(writes.mock.callCount(), 0)
  assert.equal(answer.mock.callCount(), 0)
})

test('missing or unowned document never invokes embedding API', async () => {
  stored = null
  await assert.rejects(() => askDocument(id, 'leave?', owner), { status: 404 })
  assert.equal(embed.mock.callCount(), 0)
})
