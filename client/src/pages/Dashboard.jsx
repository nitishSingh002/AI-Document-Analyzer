import { useState } from 'react'
import api from '../services/api'

export default function Dashboard() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [document, setDocument] = useState(null)

  function selectFile(event) {
    const selected = event.target.files?.[0]
    setError('')
    setDocument(null)
    setFile(null)
    if (!selected) return
    if (!/\.pdf$/i.test(selected.name) || (selected.type && selected.type !== 'application/pdf')) {
      setError('Please select a PDF file.')
      event.target.value = ''
      return
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('PDF must be 10 MB or smaller.')
      event.target.value = ''
      return
    }
    setFile(selected)
  }

  async function upload(event) {
    event.preventDefault()
    if (!file || loading) return
    setLoading(true)
    setError('')
    setDocument(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await api.post('/documents/upload', form, { timeout: 120000 })
      setDocument(data)
    } catch (uploadError) {
      setError(uploadError.response?.data?.message || (uploadError.code === 'ECONNABORTED'
        ? 'Upload timed out. The document may have been saved; check your connection before retrying.'
        : 'Unable to upload. Check your connection and try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h1>Dashboard</h1>
      <p>Upload a PDF to extract its text.</p>
      <form className="card upload-area" onSubmit={upload} aria-busy={loading}>
        <h2>Upload a document</h2>
        <label htmlFor="pdf-file">Choose one PDF (maximum 10 MB)</label>
        <input id="pdf-file" type="file" accept=".pdf,application/pdf" onChange={selectFile} disabled={loading} aria-describedby="upload-help" />
        <p id="upload-help">Text-based PDFs are supported. Scanned documents need OCR and cannot be read yet.</p>
        {file && <p className="file-name">Selected: {file.name}</p>}
        <button className="button" type="submit" disabled={!file || loading}>{loading ? 'Uploading and extracting…' : 'Upload PDF'}</button>
        <div aria-live="polite">{loading && <p>Please wait while your document is processed.</p>}</div>
        {error && <p className="upload-error" role="alert">{error}</p>}
      </form>
      {document && (
        <section className="card upload-result" aria-label="Uploaded document" aria-live="polite">
          <h2>Document uploaded</h2>
          <p className="file-name"><strong>Filename:</strong> {document.originalName}</p>
          <p><strong>Uploaded:</strong> <time dateTime={document.createdAt}>{new Date(document.createdAt).toLocaleString()}</time></p>
          <h3>Extracted text preview</h3>
          <pre className="text-preview">{document.extractedTextPreview}</pre>
        </section>
      )}
    </section>
  )
}
