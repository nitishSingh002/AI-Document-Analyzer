import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import DocumentChat from '../components/DocumentChat'

export default function Dashboard() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [document, setDocument] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const [openingId, setOpeningId] = useState(null)
  const [openError, setOpenError] = useState('')
  const fileInput = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    api.get('/documents', { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return
      // Preserve uploads and analysis completed while history was loading.
      setHistory(current => [...new Map([...data, ...current].map(item => [item.id, item])).values()]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id.localeCompare(a.id)))
    }).catch(requestError => {
      if (!controller.signal.aborted) setHistoryError(requestError.response?.data?.message || 'Unable to load document history. Please try again.')
    }).finally(() => {
      if (!controller.signal.aborted) setHistoryLoading(false)
    })
    return () => controller.abort()
  }, [historyAttempt])

  async function reopenDocument(id) {
    if (loading || analyzing || openingId) return
    setOpeningId(id)
    setOpenError('')
    try {
      const { data } = await api.get(`/documents/${id}`)
      setDocument({ ...data, extractedTextPreview: data.extractedText.slice(0, 1000) })
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setError('')
      setAnalysisError('')
    } catch (requestError) {
      setOpenError(requestError.response?.data?.message || 'Unable to open the document. Please try again.')
    } finally {
      setOpeningId(null)
    }
  }

  async function analyze() {
    if (!document || analyzing || openingId) return
    setAnalyzing(true)
    setAnalysisError('')
    try {
      const { data } = await api.post(`/documents/${document.id}/analyze`, {}, { timeout: 120000 })
      setDocument(current => current?.id === data.id ? { ...current, analysis: data.analysis } : current)
      setHistory(current => current.map(item => item.id === data.id
        ? { ...item, analyzed: true, analysis: { documentType: data.analysis.documentType } } : item))
    } catch (requestError) {
      setAnalysisError(requestError.response?.data?.message || 'Unable to analyze the document. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  function selectFile(event) {
    setOpenError('')
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
    if (!file || loading || analyzing || openingId) return
    setAnalysisError('')
    setLoading(true)
    setError('')
    setDocument(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await api.post('/documents/upload', form, { timeout: 120000 })
      setDocument(data)
      setHistory(current => [{ id: data.id, originalName: data.originalName, size: data.size,
        createdAt: data.createdAt, analyzed: false }, ...current.filter(item => item.id !== data.id)])
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
      <div className="dashboard-layout">
        <div className="document-analysis">
          <section className="card document-history" aria-labelledby="history-title" aria-busy={historyLoading || Boolean(openingId)}>
            <h2 id="history-title">Document history</h2>
            {historyLoading && <p role="status">Loading document history...</p>}
            {historyError && <div>
              <p className="upload-error" role="alert">{historyError}</p>
              <button className="button" type="button" onClick={() => {
                setHistoryLoading(true)
                setHistoryError('')
                setHistoryAttempt(current => current + 1)
              }} disabled={historyLoading}>Retry history</button>
            </div>}
            {!historyLoading && !historyError && history.length === 0 && <p>No documents yet. Upload a PDF to get started.</p>}
            {history.length > 0 && <ul className="history-list">
              {history.map(item => <li key={item.id}>
                <button className="history-document" type="button" aria-pressed={document?.id === item.id}
                  disabled={loading || analyzing || Boolean(openingId)} onClick={() => reopenDocument(item.id)}>
                  <strong>{item.originalName}</strong>
                  <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                  {item.analyzed && item.analysis?.documentType && <span>{item.analysis.documentType}</span>}
                  {document?.id === item.id && <span className="history-selected">Selected</span>}
                </button>
              </li>)}
            </ul>}
            {openingId && <p role="status">Opening document...</p>}
            {openError && <p className="upload-error" role="alert">{openError}</p>}
          </section>
          <form className="card upload-area" onSubmit={upload} aria-busy={loading}>
            <h2>Upload a document</h2>
            <label htmlFor="pdf-file">Choose one PDF (maximum 10 MB)</label>
            <input ref={fileInput} id="pdf-file" type="file" accept=".pdf,application/pdf" onChange={selectFile} disabled={loading || analyzing || Boolean(openingId)} aria-describedby="upload-help" />
            <p id="upload-help">Text-based PDFs are supported. Scanned documents need OCR and cannot be read yet.</p>
            {file && <p className="file-name">Selected: {file.name}</p>}
            <button className="button" type="submit" disabled={!file || loading || analyzing || Boolean(openingId)}>{loading ? 'Uploading and extracting…' : 'Upload PDF'}</button>
            <div aria-live="polite">{loading && <p>Please wait while your document is processed.</p>}</div>
            {error && <p className="upload-error" role="alert">{error}</p>}
          </form>
          {document && (
            <section className="card upload-result" aria-label="Uploaded document" aria-live="polite">
              <h2>Selected document</h2>
              <p className="file-name"><strong>Filename:</strong> {document.originalName}</p>
              <p><strong>Uploaded:</strong> <time dateTime={document.createdAt}>{new Date(document.createdAt).toLocaleString()}</time></p>
              <h3>Extracted text preview</h3>
              <pre className="text-preview">{document.extractedTextPreview}</pre>
              <button className="button" type="button" onClick={analyze} disabled={analyzing || Boolean(openingId)}>
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
        </div>
        <aside className="dashboard-chat" aria-label="Document chat">
          {document
            ? <DocumentChat key={document.id} documentId={document.id} />
            : <section className="card document-chat" aria-labelledby="chat-title">
                <h2 id="chat-title">Chat with Document</h2>
                <p>Upload a document to ask questions about its contents.</p>
              </section>}
        </aside>
      </div>
    </section>
  )
}
