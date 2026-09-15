import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import app from '../app.js'
import Document from '../models/Document.js'

// A small, structurally valid PDF with a real cross-reference table.
function pdf(text = '') {
  const lines = text.match(/.{1,70}/g) || []
  const stream = text ? `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map(line => `(${line}) Tj T*`).join(' ')} ET` : ''
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let source = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source))
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(source)
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(source)
}

let server
let endpoint
before(async () => {
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  endpoint = `http://127.0.0.1:${server.address().port}/api/documents/upload`
})
after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
})

async function upload(data, name = 'sample.pdf', type = 'application/pdf', count = 1, field = 'file') {
  const body = new FormData()
  if (data) for (let index = 0; index < count; index++) body.append(field, new Blob([data], { type }), name)
  const response = await fetch(endpoint, { method: 'POST', body })
  return { status: response.status, body: await response.json() }
}

test('rejects missing file', async () => {
  const result = await upload()
  assert.equal(result.status, 400)
  assert.match(result.body.message, /Select a PDF/)
})
test('validates MIME type and extension independently', async () => {
  assert.equal((await upload(pdf('Text'), 'sample.txt')).status, 415)
  assert.equal((await upload(pdf('Text'), 'sample.pdf', 'text/plain')).status, 415)
})
test('rejects oversized files', async () => {
  const result = await upload(Buffer.alloc(10 * 1024 * 1024 + 1))
  assert.equal(result.status, 413)
  assert.match(result.body.message, /10 MB/)
})
test('rejects multiple files and unexpected field names', async () => {
  assert.equal((await upload(pdf('Text'), 'a.pdf', 'application/pdf', 2)).status, 400)
  assert.equal((await upload(pdf('Text'), 'a.pdf', 'application/pdf', 1, 'document')).status, 400)
})
test('rejects malformed multipart requests with a JSON error', async () => {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'invalid' })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).message, 'Invalid multipart upload.')
})
test('rejects disguised and corrupt PDFs', async () => {
  assert.equal((await upload(Buffer.from('not a PDF'))).status, 422)
  assert.equal((await upload(Buffer.from('%PDF-1.4\nbroken'))).status, 422)
})
test('rejects a valid PDF without text', async () => {
  const result = await upload(pdf())
  assert.equal(result.status, 422)
  assert.match(result.body.message, /No text/)
})
test('extracts real PDF text, validates model data, and returns a bounded preview', async (context) => {
  const content = 'Hello document analyzer. '.repeat(50)
  let saved
  context.mock.method(Document, 'create', async (data) => {
    saved = new Document(data)
    await saved.validate()
    return saved
  })
  const input = pdf(content)
  const result = await upload(input, 'REPORT.PDF')
  assert.equal(result.status, 201)
  assert.equal(result.body.id, saved.id)
  assert.equal(result.body.originalName, 'REPORT.PDF')
  assert.equal(result.body.size, input.length)
  assert.match(saved.extractedText, /Hello document analyzer/)
  assert.ok(saved.extractedText.length > 1000)
  assert.equal(result.body.extractedTextPreview, saved.extractedText.slice(0, 1000))
  assert.equal(result.body.createdAt, saved.createdAt.toISOString())
  assert.match(saved.fileName, /^[a-f0-9-]+\.pdf$/)
  assert.equal(saved.mimeType, 'application/pdf')
  assert.equal(result.body.extractedText, undefined)
})
test('returns a safe database error', async (context) => {
  context.mock.method(Document, 'create', async () => { throw new Error('private database details') })
  const result = await upload(pdf('Text'))
  assert.equal(result.status, 503)
  assert.match(result.body.message, /Unable to save/)
  assert.ok(!JSON.stringify(result.body).includes('private database details'))
})
