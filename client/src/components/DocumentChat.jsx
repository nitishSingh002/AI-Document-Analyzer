import { useEffect, useRef, useState } from 'react'
import api from '../services/api'

export default function DocumentChat({ documentId }) {
  return <DocumentConversation key={documentId} documentId={documentId} />
}

function DocumentConversation({ documentId }) {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState([])
  const [pendingQuestion, setPendingQuestion] = useState('')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const conversation = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    api.get(`/documents/${documentId}/chat`, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setMessages(data)
    }).catch(requestError => {
      if (!controller.signal.aborted) setHistoryError(requestError.response?.data?.message || 'Unable to load chat history. Please try again.')
    }).finally(() => {
      if (!controller.signal.aborted) setHistoryLoading(false)
    })
    return () => controller.abort()
  }, [documentId, historyAttempt])

  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight
  }, [messages, pendingQuestion, loading])

  async function ask(event) {
    event.preventDefault()
    if (loading || historyLoading || historyError || !question.trim()) return
    const submittedQuestion = question.trim()
    setLoading(true)
    setError('')
    setPendingQuestion(submittedQuestion)
    try {
      const { data } = await api.post(`/documents/${documentId}/ask`, { question: submittedQuestion }, { timeout: 120000 })
      const createdAt = new Date().toISOString()
      setMessages(current => [...current,
        { role: 'user', content: submittedQuestion, createdAt },
        { role: 'assistant', content: data.answer, createdAt, sources: data.sources },
      ])
      setQuestion('')
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to confirm the answer was saved. Reload chat history before trying again.')
    } finally {
      setPendingQuestion('')
      setLoading(false)
    }
  }

  function reloadHistory() {
    setHistoryLoading(true)
    setHistoryError('')
    setError('')
    setHistoryAttempt(current => current + 1)
  }

  return (
    <section className="card document-chat" aria-labelledby="chat-title">
      <h2 id="chat-title">Chat with Document</h2>
      <p>Ask one question at a time. Answers use relevant passages from this document.</p>
      {historyLoading && <p role="status">Loading chat history...</p>}
      {historyError && <div>
        <p className="upload-error" role="alert">{historyError}</p>
        <button className="button" type="button" onClick={reloadHistory}>Retry history</button>
      </div>}
      <div ref={conversation} className="chat-conversation" role="log" aria-label="Conversation" tabIndex={0} aria-busy={historyLoading}>
        {!historyLoading && !historyError && messages.length === 0 && !pendingQuestion && <p>No messages yet. Ask a question to start.</p>}
        {messages.map((message, index) => <article className={`chat-message chat-message-${message.role}`} key={index}>
          <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
          <p className="chat-answer">{message.content}</p>
          {message.sources?.length > 0 && <details>
            <summary>Source previews</summary>
            <ul className="chat-sources">{message.sources.map(source => <li key={source.chunkIndex}>
              <strong>Passage {source.chunkIndex + 1}</strong>
              <p>{source.preview}</p>
            </li>)}</ul>
          </details>}
        </article>)}
        {pendingQuestion && <article className="chat-message chat-message-user">
          <strong>You · Sending</strong>
          <p className="chat-answer">{pendingQuestion}</p>
        </article>}
        {loading && <p role="status">Finding relevant context and preparing an answer...</p>}
      </div>
      {error && <div>
        <p className="upload-error" role="alert">{error}</p>
        <button className="button" type="button" onClick={reloadHistory} disabled={loading || historyLoading}>Reload chat history</button>
      </div>}
      <form onSubmit={ask} aria-busy={loading}>
        <label htmlFor="document-question">Your question</label>
        <textarea id="document-question" value={question} onChange={event => setQuestion(event.target.value)}
          maxLength={2000} rows={3} required disabled={loading || historyLoading || Boolean(historyError)} aria-describedby="question-limit" />
        <small id="question-limit">{question.length}/2000 characters</small>
        <div><button className="button" disabled={loading || historyLoading || Boolean(historyError) || !question.trim()}>{loading ? 'Asking...' : 'Ask'}</button></div>
      </form>
    </section>
  )
}
