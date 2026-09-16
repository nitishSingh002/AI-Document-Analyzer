import { useState } from 'react'
import api from '../services/api'
import DocumentChat from '../components/DocumentChat'

export default function Dashboard() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [document, setDocument] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

  async function analyze() {
    if (!document || analyzing) return
    setAnalyzing(true)
    setAnalysisError('')
    try {
      const { data } = await api.post(`/documents/${document.id}/analyze`, {}, { timeout: 120000 })
      setDocument(current => current?.id === data.id ? { ...current, analysis: data.analysis } : current)
    } catch (requestError) {
      setAnalysisError(requestError.response?.data?.message || 'Unable to analyze the document. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  function selectFile(event) {
    setAnalysisError('')
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
    if (!file || loading || analyzing) return
    setAnalysisError('')
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
        <input id="pdf-file" type="file" accept=".pdf,application/pdf" onChange={selectFile} disabled={loading || analyzing} aria-describedby="upload-help" />
        <p id="upload-help">Text-based PDFs are supported. Scanned documents need OCR and cannot be read yet.</p>
        {file && <p className="file-name">Selected: {file.name}</p>}
        <button className="button" type="submit" disabled={!file || loading || analyzing}>{loading ? 'Uploading and extracting…' : 'Upload PDF'}</button>
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
          <button className="button" type="button" onClick={analyze} disabled={analyzing}>
            {analyzing ? 'Analyzing...' : 'Analyze Document'}
          </button>
          {analyzing && <p role="status">Analyzing your document. This may take a moment.</p>}
          {analysisError && <p className="upload-error" role="alert">{analysisError}</p>}
          {document.analysis && (
            <div className="analysis-result">
              <h3>AI Summary</h3>
              <p>{document.analysis.summary}</p>
              <h3>Key Points</h3>
              <ul>{document.analysis.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>
              <h3>Document Type</h3>
              <p>{document.analysis.documentType}</p>
              <h3>Important Entities</h3>
              {document.analysis.entities.length > 0
                ? <ul>{document.analysis.entities.map((entity, index) => <li key={index}>{entity}</li>)}</ul>
                : <p>No notable named entities found.</p>}
            </div>
          )}
        </section>
      )}
      {document && <DocumentChat key={document.id} documentId={document.id} />}
    </section>
  )
}
