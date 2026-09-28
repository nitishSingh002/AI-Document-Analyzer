import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { sanitizeGeminiJsonSchema } from '../services/aiService.js'

test('Gemini schema sanitization removes unsupported constraints and retains supported structure', () => {
  const source = z.object({
    kind: z.enum(['invoice', 'report']),
    details: z.object({ title: z.string().min(1), points: z.array(z.string()).min(2).max(5) }).strict(),
  }).strict()
  const generated = z.toJSONSchema(source)
  const sanitized = sanitizeGeminiJsonSchema(generated)

  assert.ok('$schema' in generated)
  assert.equal(sanitized.$schema, undefined)
  assert.equal(sanitized.properties.details.properties.title.minLength, undefined)
  assert.equal(sanitized.properties.details.properties.title.type, 'string')
  assert.equal(sanitized.properties.details.properties.points.items.type, 'string')
  assert.equal(sanitized.properties.details.properties.points.minItems, 2)
  assert.equal(sanitized.properties.details.properties.points.maxItems, 5)
  assert.deepEqual(sanitized.properties.kind.enum, ['invoice', 'report'])
  assert.deepEqual(sanitized.required, ['kind', 'details'])
  assert.equal(sanitized.properties.details.additionalProperties, false)
  assert.equal(sanitized.additionalProperties, false)
})

test('Gemini schema sanitization does not modify Zod source JSON Schema', () => {
  const generated = z.toJSONSchema(z.string().min(1).max(10))
  const original = structuredClone(generated)
  sanitizeGeminiJsonSchema(generated)
  assert.deepEqual(generated, original)
})
