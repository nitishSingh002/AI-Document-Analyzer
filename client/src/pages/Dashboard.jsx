import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import DocumentChat from '../components/DocumentChat'
import DocumentHistory from '../components/DocumentHistory'
import UploadPanel from '../components/UploadPanel'
import AnalysisPanel from '../components/AnalysisPanel'

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
  const deletedIds = useRef(new Set())
  const [managingId, setManagingId] = useState(null)
  const [managementError, setManagementError] = useState('')
  const [managementStatus, setManagementStatus] = useState('')
  const busy = loading || analyzing || Boolean(openingId) || Boolean(managingId)

  async function deleteDocument(item) {
    if (busy || !window.confirm(`Delete "${item.displayName || item.originalName}"? Its analysis and chat history will also be permanently deleted.`)) return
    setManagingId(item.id); setManagementError(''); setManagementStatus('Deleting document...')
    try {
      await api.delete(`/documents/${item.id}`)
      deletedIds.current.add(item.id)
      setHistory(current => current.filter(entry => entry.id !== item.id))
      if (document?.id === item.id) {
        setDocument(null); setFile(null)
        if (fileInput.current) fileInput.current.value = ''
        setError(''); setAnalysisError('')
      }
      setOpenError(''); setManagementStatus('Document deleted.')
    } catch (requestError) {
      setManagementStatus(''); setManagementError(requestError.response?.data?.message || 'Unable to delete the document. Please try again.')
    } finally { setManagingId(null) }
  }

  async function renameDocument(item) {
    if (busy) return
    const name = window.prompt('New display name (up to 200 characters)', item.displayName || item.originalName)
    if (name === null) return
    setManagementError(''); setManagementStatus('')
    if (!name.trim() || name.trim().length > 200) { setManagementError('Provide a display name between 1 and 200 characters.'); return }
    setManagingId(item.id); setManagementStatus('Renaming document...')
    try {
      const { data } = await api.patch(`/documents/${item.id}`, { name })
      setHistory(current => current.map(entry => entry.id === item.id ? { ...entry, displayName: data.displayName } : entry))
      setDocument(current => current?.id === item.id ? { ...current, displayName: data.displayName } : current)
      setManagementStatus('Document renamed.')
    } catch (requestError) {
      setManagementStatus(''); setManagementError(requestError.response?.data?.message || 'Unable to rename the document. Please try again.')
    } finally { setManagingId(null) }
  }

  useEffect(() => {
    const controller = new AbortController()
    api.get('/documents', { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return
      setHistory(current => [...new Map([...data, ...current].map(item => [item.id, item])).values()]
        .filter(item => !deletedIds.current.has(item.id))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id.localeCompare(a.id)))
    }).catch(requestError => {
      if (!controller.signal.aborted) setHistoryError(requestError.response?.data?.message || 'Unable to load document history. Please try again.')
    }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false) })
    return () => controller.abort()
  }, [historyAttempt])

  async function reopenDocument(id) {
    if (busy) return
    setOpeningId(id); setOpenError('')
    try {
      const { data } = await api.get(`/documents/${id}`)
      setDocument({ ...data, extractedTextPreview: data.extractedText.slice(0, 1000) })
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setError(''); setAnalysisError('')
    } catch (requestError) {
      setOpenError(requestError.response?.data?.message || 'Unable to open the document. Please try again.')
    } finally { setOpeningId(null) }
  }

  async function analyze() {
    if (!document || busy) return
    setAnalyzing(true); setAnalysisError('')
    try {
      const { data } = await api.post(`/documents/${document.id}/analyze`, {}, { timeout: 120000 })
      setDocument(current => current?.id === data.id ? { ...current, analysis: data.analysis } : current)
      setHistory(current => current.map(item => item.id === data.id
        ? { ...item, analyzed: true, analysis: { documentType: data.analysis.documentType } } : item))
    } catch (requestError) {
      setAnalysisError(requestError.response?.data?.message || 'Unable to analyze the document. Please try again.')
    } finally { setAnalyzing(false) }
  }

  function acceptFile(selected, input) {
    setOpenError(''); setAnalysisError(''); setError(''); setDocument(null); setFile(null)
    if (!selected) return
    if (!/\.pdf$/i.test(selected.name) || (selected.type && selected.type !== 'application/pdf')) {
      setError('Please select a PDF file.'); if (input) input.value = ''; return
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('PDF must be 10 MB or smaller.'); if (input) input.value = ''; return
    }
    setFile(selected)
  }

  function selectFile(event) { acceptFile(event.target.files?.[0], event.target) }
  function dropFile(event) { event.preventDefault(); acceptFile(event.dataTransfer.files?.[0], fileInput.current) }

  async function upload(event) {
    event.preventDefault()
    if (!file || busy) return
    setAnalysisError(''); setLoading(true); setError(''); setDocument(null)
    const form = new FormData(); form.append('file', file)
    try {
      const { data } = await api.post('/documents/upload', form, { timeout: 120000 })
      setDocument(data)
      setHistory(current => [{ id: data.id, originalName: data.originalName, size: data.size,
        createdAt: data.createdAt, analyzed: false }, ...current.filter(item => item.id !== data.id)])
    } catch (uploadError) {
      setError(uploadError.response?.data?.message || (uploadError.code === 'ECONNABORTED'
        ? 'Upload timed out. The document may have been saved; check your connection before retrying.'
        : 'Unable to upload. Check your connection and try again.'))
    } finally { setLoading(false) }
  }

  return <section className="dashboard-page">
    <header className="dashboard-title"><div><p className="eyebrow">WORKSPACE</p><h1>Your documents</h1>
      <p>Upload, understand, and ask questions about your documents.</p></div></header>
    <div className="dashboard-layout">
      <DocumentHistory history={history} documentId={document?.id} historyLoading={historyLoading} historyError={historyError}
        retryHistory={() => { setHistoryLoading(true); setHistoryError(''); setHistoryAttempt(current => current + 1) }}
        historyBusy={busy} openingId={openingId} openError={openError} managementError={managementError} managementStatus={managementStatus}
        onOpen={reopenDocument} onRename={renameDocument} onDelete={deleteDocument} />
      <div className="document-analysis">
        <UploadPanel file={file} fileInput={fileInput} busy={busy} loading={loading} error={error}
          onSelect={selectFile} onDrop={dropFile} onUpload={upload} />
        {document && <AnalysisPanel document={document} busy={busy} analyzing={analyzing} analysisError={analysisError} onAnalyze={analyze} />}
      </div>
      <aside className="dashboard-chat" aria-label="Document chat">
        {document ? <DocumentChat key={document.id} documentId={document.id} /> : <section className="card document-chat chat-empty" aria-labelledby="chat-title">
          <div className="chat-empty-icon" aria-hidden="true">✦</div><p className="eyebrow">ASK & EXPLORE</p>
          <h2 id="chat-title">Chat with Document</h2><p>Upload a document to ask questions about its contents.</p>
          <div className="chat-empty-hint">Your answers will include relevant source passages.</div>
        </section>}
      </aside>
    </div>
  </section>
}
