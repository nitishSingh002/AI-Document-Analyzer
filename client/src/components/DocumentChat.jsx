import { useState } from 'react'
import api from '../services/api'

export default function DocumentChat({ documentId }) {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function ask(event) {
    event.preventDefault()
    if (loading || !question.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const { data } = await api.post(`/documents/${documentId}/ask`, { question: question.trim() }, { timeout: 120000 })
      setResult(data)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to answer your question. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card document-chat" aria-labelledby="chat-title">
      <h2 id="chat-title">Chat with Document</h2>
      <p>Ask one question at a time. Answers use relevant passages from this document.</p>
      <form onSubmit={ask} aria-busy={loading}>
        <label htmlFor="document-question">Your question</label>
        <textarea id="document-question" value={question} onChange={event => setQuestion(event.target.value)}
          maxLength={2000} rows={3} required disabled={loading} aria-describedby="question-limit" />
        <small id="question-limit">{question.length}/2000 characters</small>
        <div><button className="button" disabled={loading || !question.trim()}>{loading ? 'Asking...' : 'Ask'}</button></div>
      </form>
      {loading && <p role="status">Finding relevant context and preparing an answer...</p>}
      {error && <p className="upload-error" role="alert">{error}</p>}
      {result && <div aria-live="polite">
        <h3>Answer</h3>
        <p className="chat-answer">{result.answer}</p>
        {result.sources.length > 0 && <>
          <h3>Retrieved context</h3>
          <ul className="chat-sources">{result.sources.map(source => <li key={source.chunkIndex}>
            <strong>Passage {source.chunkIndex + 1}</strong>
            <p>{source.preview}</p>
          </li>)}</ul>
        </>}
      </div>}
    </section>
  )
}
