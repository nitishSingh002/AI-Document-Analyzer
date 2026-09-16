import assert from 'node:assert/strict'
import { once } from 'node:events'
import { before, after, beforeEach, test } from 'node:test'
import { Models } from '@google/genai'
import app from '../app.js'
import Document from '../models/Document.js'
import { env } from '../config/env.js'

function geminiResponse(value, finishReason = 'STOP') {
  return { text: JSON.stringify(value), candidates: [{ finishReason }] }
}

const id = '507f1f77bcf86cd799439011'
const result = {
  summary: 'A report on a document analyzer built with Node.js.',
  keyPoints: ['Accepts PDFs.', 'Extracts text.', 'Stores documents.', 'Uses Node.js.', 'Provides analysis.'],
  documentType: 'report',
  entities: ['Node.js'],
}
let server
let base
let originalKey
let parseMock
let updateMock

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
  context.mock.method(Document, 'findById', async () => ({ _id: id, extractedText: 'Saved document text' }))
  updateMock = context.mock.method(Document, 'findByIdAndUpdate', async (documentId, update) => ({
    _id: documentId, analysis: update.$set.analysis,
  }))
  parseMock = context.mock.method(Models.prototype, 'generateContentInternal', async () => geminiResponse(result))
})
async function analyze(documentId = id) {
  const response = await fetch(`${base}/${documentId}/analyze`, { method: 'POST' })
  return { status: response.status, body: await response.json() }
}

test('analyzes stored text with strict Structured Outputs and saves validated analysis', async () => {
  const response = await analyze()
  assert.equal(response.status, 200)
  assert.equal(response.body.id, id)
  assert.equal(response.body.analysis.summary, result.summary)
  assert.ok(Number.isFinite(Date.parse(response.body.analysis.analyzedAt)))
  const request = parseMock.mock.calls[0].arguments[0]
  assert.deepEqual(request.contents, [{ role: 'user', parts: [{ text: 'Saved document text' }] }])
  assert.equal(request.model, env.geminiModel)
  assert.equal(request.config.responseMimeType, 'application/json')
  assert.equal(request.config.responseJsonSchema.additionalProperties, false)
  assert.deepEqual(Object.keys(request.config.responseJsonSchema.properties).sort(), Object.keys(result).sort())
  assert.deepEqual(request.config.responseJsonSchema.required.sort(), Object.keys(result).sort())
  assert.deepEqual(updateMock.mock.calls[0].arguments[2], { returnDocument: 'after', runValidators: true })
  assert.equal(response.body.extractedText, undefined)
  assert.ok(!JSON.stringify(response.body).includes(env.geminiApiKey))
})
test('invalid ID fails before database or Gemini work', async () => {
  assert.equal((await analyze('invalid')).status, 400)
  assert.equal(Document.findById.mock.callCount(), 0)
  assert.equal(parseMock.mock.callCount(), 0)
})
test('missing document returns 404', async () => {
  Document.findById.mock.mockImplementation(async () => null)
  assert.equal((await analyze()).status, 404)
  assert.equal(parseMock.mock.callCount(), 0)
})
test('empty text returns 422 without calling Gemini', async () => {
  Document.findById.mock.mockImplementation(async () => ({ extractedText: '  ' }))
  assert.equal((await analyze()).status, 422)
  assert.equal(parseMock.mock.callCount(), 0)
})
test('missing API key returns a configuration error', async () => {
  env.geminiApiKey = ''
  const response = await analyze()
  assert.equal(response.status, 503)
  assert.match(response.body.message, /GEMINI_API_KEY/)
  assert.equal(parseMock.mock.callCount(), 0)
})
test('database read failure is handled', async () => {
  Document.findById.mock.mockImplementation(async () => { throw new Error('private connection string') })
  const response = await analyze()
  assert.equal(response.status, 503)
  assert.match(response.body.message, /Unable to load/)
  assert.equal(parseMock.mock.callCount(), 0)
})
test('Gemini API failures do not leak details or save analysis', async () => {
  parseMock.mock.mockImplementation(async () => { throw new Error('private API credentials') })
  const response = await analyze()
  assert.equal(response.status, 502)
  assert.ok(!JSON.stringify(response.body).includes('private'))
  assert.equal(updateMock.mock.callCount(), 0)
})
test('Gemini diagnostics include useful fields, redact keys, and keep the frontend generic', async (context) => {
  const logs = context.mock.method(console, 'error', () => {})
  const info = context.mock.method(console, 'info', () => {})
  const providerError = Object.assign(new Error(`Incorrect API key: ${env.geminiApiKey}; AIza-partial***suffix; Bearer another-secret`), {
    name: 'AuthenticationError', status: 401, code: 'invalid_api_key',
    type: 'invalid_request_error', param: null, request_id: 'req_test',
    headers: { authorization: 'Bearer header-secret' },
  })
  parseMock.mock.mockImplementation(async () => { throw providerError })
  const response = await analyze()
  assert.deepEqual(response.body, { status: 'error', message: 'AI analysis failed. Please try again later.' })
  assert.equal(response.status, 502)
  const diagnostic = info.mock.calls.find(call => call.arguments[0] === 'Gemini request:').arguments[1]
  assert.deepEqual(diagnostic, { model: env.geminiModel, retryNumber: 0, status: 401, fallbackUsed: false })
  assert.equal(parseMock.mock.callCount(), 1)
  const serialized = JSON.stringify([...logs.mock.calls, ...info.mock.calls].map(call => call.arguments))
  for (const secret of [env.geminiApiKey, 'AIza-partial', 'another-secret', 'header-secret', 'Incorrect API key']) {
    assert.ok(!serialized.includes(secret))
  }
  assert.deepEqual(info.mock.calls[0].arguments[1], { apiKeyLoaded: true, model: env.geminiModel })
})

test('SDK parsing errors are handled', async () => {
  parseMock.mock.mockImplementation(async () => { throw new SyntaxError('bad JSON') })
  const response = await analyze()
  assert.equal(response.status, 502)
  assert.match(response.body.message, /malformed/)
  assert.equal(updateMock.mock.callCount(), 0)
})
test('refused, incomplete, missing, and malformed outputs are never saved', async () => {
  for (const output of [
    { candidates: [], promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'STOP' }] },
    geminiResponse(null),
    geminiResponse(result, 'MAX_TOKENS'),
    geminiResponse(result, 'SAFETY'),
    geminiResponse({ ...result, extra: 'not allowed' }),
    geminiResponse({ ...result, summary: ' ' }),
    geminiResponse({ ...result, entities: [42] }),
    geminiResponse({ ...result, keyPoints: [] }),
  ]) {
    parseMock.mock.mockImplementation(async () => output)
    assert.equal((await analyze()).status, 502)
  }
  assert.equal(updateMock.mock.callCount(), 0)
})
test('context limit errors are actionable', async () => {
  parseMock.mock.mockImplementation(async () => { throw Object.assign(new Error('The input token count exceeds the maximum number of tokens allowed'), { status: 400 }) })
  assert.equal((await analyze()).status, 422)
  assert.equal(updateMock.mock.callCount(), 0)
})
test('database update failure returns 503', async () => {
  updateMock.mock.mockImplementation(async () => { throw new Error('private database detail') })
  const response = await analyze()
  assert.equal(response.status, 503)
  assert.match(response.body.message, /Unable to save the analysis/)
})
test('document deleted during analysis returns 404', async () => {
  updateMock.mock.mockImplementation(async () => null)
  assert.equal((await analyze()).status, 404)
})

test('invalid JSON text from Gemini is rejected without a database update', async () => {
  parseMock.mock.mockImplementation(async () => ({ text: '```json invalid```', candidates: [{ finishReason: 'STOP' }] }))
  assert.equal((await analyze()).status, 502)
  assert.equal(updateMock.mock.callCount(), 0)
})
