import assert from 'node:assert/strict'
import { beforeEach, afterEach, test } from 'node:test'
import timers from 'node:timers/promises'
import { Models } from '@google/genai'
import { env } from '../config/env.js'
import { analyzeText, answerQuestion } from '../services/aiService.js'

const privateText = 'Confidential document contents never belong in logs.'
const analysis = { summary: 'A summary.', keyPoints: ['One', 'Two', 'Three', 'Four', 'Five'], documentType: 'report', entities: [] }
let originalEnv, generate, sleep, logs

beforeEach(context => {
  originalEnv = { ...env }
  env.geminiApiKey = 'secret-test-key'
  env.geminiModel = 'primary-model'
  env.geminiFallbackModel = 'fallback-model'
  generate = context.mock.method(Models.prototype, 'generateContentInternal')
  sleep = context.mock.method(timers, 'setTimeout', async () => {})
  logs = context.mock.method(console, 'info', () => {})
})
afterEach(() => Object.assign(env, originalEnv))

function failure(status) { return Object.assign(new Error(`${privateText} ${env.geminiApiKey}`), status ? { status } : {}) }
function success(value) { return { text: JSON.stringify(value), candidates: [{ finishReason: 'STOP' }] } }
function models() { return generate.mock.calls.map(call => call.arguments[0].model) }
function diagnostics() { return logs.mock.calls.filter(call => call.arguments[0] === 'Gemini request:').map(call => call.arguments[1]) }
const cases = [
  ['analysis', () => analyzeText(privateText), analysis, value => value],
  ['chat', () => answerQuestion('What does it say?', [{ chunkIndex: 0, text: privateText }]), { answer: 'An answer.' }, value => value.answer],
]

for (const [name, run, value, expected] of cases) {
  test(`${name}: primary 200 returns immediately`, async () => {
    generate.mock.mockImplementation(async () => success(value))
    assert.deepEqual(await run(), expected(value))
    assert.deepEqual(models(), ['primary-model'])
    assert.equal(sleep.mock.callCount(), 0)
  })

  for (const status of [429, 503]) {
    test(`${name}: primary ${status} retries once then succeeds`, async () => {
      let calls = 0
      generate.mock.mockImplementation(async () => ++calls === 1 ? Promise.reject(failure(status)) : success(value))
      await run()
      assert.deepEqual(models(), ['primary-model', 'primary-model'])
      assert.equal(sleep.mock.callCount(), 1)
      assert.deepEqual(diagnostics().map(item => [item.status, item.retryNumber]), [[status, 0], [200, 1]])
    })

    test(`${name}: primary ${status} retries once then fallback succeeds`, async () => {
      generate.mock.mockImplementation(async request => request.model === 'primary-model' ? Promise.reject(failure(status)) : success(value))
      await run()
      assert.deepEqual(models(), ['primary-model', 'primary-model', 'fallback-model'])
      assert.deepEqual(diagnostics().map(item => item.switchingToFallback), [false, true, false])
      assert.equal(diagnostics()[2].fallbackUsed, true)
    })
  }

  for (const status of [400, 401, 403, 404]) {
    test(`${name}: permanent ${status} does not retry or fallback`, async () => {
      generate.mock.mockImplementation(async () => { throw failure(status) })
      await assert.rejects(run)
      assert.deepEqual(models(), ['primary-model'])
      assert.equal(sleep.mock.callCount(), 0)
    })
  }

  test(`${name}: fallback transient failure retries once then returns sanitized error`, async () => {
    generate.mock.mockImplementation(async () => { throw failure(429) })
    await assert.rejects(run, { status: 429 })
    assert.deepEqual(models(), ['primary-model', 'primary-model', 'fallback-model', 'fallback-model'])
    assert.equal(sleep.mock.callCount(), 2)
    assert.equal(diagnostics().at(-1).switchingToFallback, false)
    const serialized = JSON.stringify(diagnostics())
    assert.ok(!serialized.includes(privateText))
    assert.ok(!serialized.includes(env.geminiApiKey))
  })

  test(`${name}: network failure retries then switches to fallback`, async () => {
    generate.mock.mockImplementation(async request => request.model === 'primary-model' ? Promise.reject(new TypeError('fetch failed')) : success(value))
    await run()
    assert.deepEqual(models(), ['primary-model', 'primary-model', 'fallback-model'])
  })

  test(`${name}: fallback is never looped and receives at most one retry`, async () => {
    env.geminiFallbackModel = env.geminiModel
    generate.mock.mockImplementation(async () => { throw failure(503) })
    await assert.rejects(run, { status: 503 })
    assert.deepEqual(models(), ['primary-model', 'primary-model'])
  })
}

test('unreasonable Retry-After is ignored and retry delay stays bounded', async () => {
  const error = Object.assign(failure(429), { headers: { 'retry-after': '3600' } })
  let calls = 0
  generate.mock.mockImplementation(async () => ++calls === 1 ? Promise.reject(error) : success(analysis))
  await analyzeText(privateText)
  assert.ok(sleep.mock.calls[0].arguments[0] <= 5000)
})
