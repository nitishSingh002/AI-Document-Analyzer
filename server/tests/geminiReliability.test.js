import assert from 'node:assert/strict'
import { beforeEach, afterEach, test } from 'node:test'
import timers from 'node:timers/promises'
import { Models } from '@google/genai'
import { env } from '../config/env.js'
import { analyzeText, answerQuestion } from '../services/aiService.js'

const privateText = 'Confidential document contents never belong in logs.'
const analysis = {
  summary: 'A summary.', keyPoints: ['One', 'Two', 'Three', 'Four', 'Five'],
  documentType: 'report', entities: [],
}
let originalEnv, generate, sleep, logs, errors
beforeEach(context => {
  originalEnv = { ...env }
  env.geminiApiKey = 'secret-test-key'
  env.geminiModel = 'primary-model'
  env.geminiFallbackModel = 'fallback-model'
  generate = context.mock.method(Models.prototype, 'generateContentInternal')
  sleep = context.mock.method(timers, 'setTimeout', async () => {})
  logs = context.mock.method(console, 'info', () => {})
  errors = context.mock.method(console, 'error', () => {})
})
afterEach(() => Object.assign(env, originalEnv))

function unavailable(status = 503) {
  return Object.assign(new Error(`${privateText} ${env.geminiApiKey}`), { status })
}
function success(value) {
  return { text: JSON.stringify(value), candidates: [{ finishReason: 'STOP' }] }
}
function attemptedModels() {
  return generate.mock.calls.map(call => call.arguments[0].model)
}
function assertBackoff() {
  assert.equal(sleep.mock.callCount(), 3)
  for (const [index, call] of sleep.mock.calls.entries()) {
    const delay = call.arguments[0]
    assert.ok(delay >= 1000 * 2 ** index * 0.8 && delay <= 1000 * 2 ** index * 1.2)
  }
}

for (const [name, run, value, genericError] of [
  ['analysis', () => analyzeText(privateText), analysis, 'AI analysis failed. Please try again later.'],
  ['chat', () => answerQuestion('What does it say?', [{ chunkIndex: 0, text: privateText }]), { answer: 'An answer.' }, 'AI question answering failed. Please try again later.'],
]) {
  test(`${name}: success without retry`, async () => {
    generate.mock.mockImplementation(async () => success(value))
    assert.deepEqual(await run(), name === 'chat' ? value.answer : value)
    assert.deepEqual(attemptedModels(), ['primary-model'])
    assert.equal(sleep.mock.callCount(), 0)
  })
  test(`${name}: 503 then successful retry`, async () => {
    let calls = 0
    generate.mock.mockImplementation(async () => {
      if (++calls === 1) throw unavailable()
      return success(value)
    })
    await run()
    assert.deepEqual(attemptedModels(), ['primary-model', 'primary-model'])
    assert.equal(sleep.mock.callCount(), 1)
    assert.ok(sleep.mock.calls[0].arguments[0] >= 800 && sleep.mock.calls[0].arguments[0] <= 1200)
    const diagnostics = logs.mock.calls.filter(call => call.arguments[0] === 'Gemini request:').map(call => call.arguments[1])
    assert.deepEqual(diagnostics.map(log => log.status), [503, 200])
    assert.deepEqual(diagnostics.map(log => log.retryNumber), [0, 1])
  })
  test(`${name}: repeated 503 then fallback success preserves payload`, async () => {
    generate.mock.mockImplementation(async request => {
      if (request.model === 'primary-model') throw unavailable()
      return success(value)
    })
    await run()
    assert.deepEqual(attemptedModels(), [...Array(4).fill('primary-model'), 'fallback-model'])
    assertBackoff()
    const initial = generate.mock.calls[0].arguments[0]
    const fallback = generate.mock.calls[4].arguments[0]
    assert.deepEqual(fallback.contents, initial.contents)
    assert.deepEqual(fallback.config, initial.config)
    assert.deepEqual(logs.mock.calls.at(-1).arguments[1], { model: 'fallback-model', retryNumber: 0, status: 200, fallbackUsed: true })
  })
  for (const status of [400, 401, 403, 404]) {
    test(`${name}: permanent ${status} does not retry or use fallback`, async () => {
      generate.mock.mockImplementation(async () => { throw unavailable(status) })
      await assert.rejects(run, { status: 502, message: genericError })
      assert.deepEqual(attemptedModels(), ['primary-model'])
      assert.equal(sleep.mock.callCount(), 0)
    })
  }
  test(`${name}: fallback failure returns existing generic error and safe diagnostics`, async () => {
    generate.mock.mockImplementation(async () => { throw unavailable() })
    await assert.rejects(run, { status: 502, message: genericError })
    assert.deepEqual(attemptedModels(), [...Array(4).fill('primary-model'), 'fallback-model'])
    assertBackoff()
    const serialized = JSON.stringify([...logs.mock.calls, ...errors.mock.calls])
    assert.ok(!serialized.includes(privateText))
    assert.ok(!serialized.includes(env.geminiApiKey))
    assert.deepEqual(logs.mock.calls.at(-1).arguments[1], { model: 'fallback-model', retryNumber: 0, status: 503, fallbackUsed: true })
  })
  test(`${name}: 429 and other 5xx errors are retryable`, async () => {
    let calls = 0
    generate.mock.mockImplementation(async () => {
      if (calls < 3) throw unavailable([429, 500, 502][calls++])
      return success(value)
    })
    await run()
    assert.deepEqual(attemptedModels(), Array(4).fill('primary-model'))
    assertBackoff()
  })
  test(`${name}: identical fallback is not attempted twice`, async () => {
    env.geminiFallbackModel = env.geminiModel
    generate.mock.mockImplementation(async () => { throw unavailable() })
    await assert.rejects(run, { status: 502, message: genericError })
    assert.deepEqual(attemptedModels(), Array(4).fill('primary-model'))
    assertBackoff()
  })
  test(`${name}: a permanent error after a transient one stops retries`, async () => {
    let calls = 0
    generate.mock.mockImplementation(async () => { throw unavailable(++calls === 1 ? 503 : 401) })
    await assert.rejects(run, { status: 502, message: genericError })
    assert.deepEqual(attemptedModels(), ['primary-model', 'primary-model'])
    assert.equal(sleep.mock.callCount(), 1)
  })
  test(`${name}: malformed successful response is not retried`, async () => {
    generate.mock.mockImplementation(async () => ({ text: 'invalid JSON', candidates: [{ finishReason: 'STOP' }] }))
    await assert.rejects(run, { status: 502 })
    assert.equal(generate.mock.callCount(), 1)
    assert.equal(sleep.mock.callCount(), 0)
  })
}
