import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function AuthPage({ mode }) {
  const register = mode === 'register'
  const { user, loading: checking, error: sessionError, retry, authenticate } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (loading) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    setLoading(true)
    setError('')
    try {
      await authenticate(mode, values)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to connect. Please try again.')
    } finally { setLoading(false) }
  }
  if (checking) return <p role="status">Checking your session...</p>
  if (user) return <Navigate to="/dashboard" replace />
  if (sessionError) return <section className="card"><p role="alert">{sessionError}</p><button className="button" onClick={retry}>Retry</button></section>
  return <section className="card auth-card">
    <h1>{register ? 'Create an account' : 'Log in'}</h1>
    <form className="auth-form" onSubmit={submit} aria-busy={loading}>
      {register && <label>Name<input name="name" autoComplete="name" required maxLength={100} disabled={loading} /></label>}
      <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={loading} /></label>
      <label>Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={8} maxLength={72} disabled={loading} aria-describedby={register ? 'password-help' : undefined} /></label>
      {register && <small id="password-help">Use at least 8 characters, up to 72 UTF-8 bytes.</small>}
      {error && <p className="upload-error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={loading}>{loading ? 'Please wait...' : register ? 'Register' : 'Log in'}</button>
    </form>
    <p>{register ? 'Already have an account? ' : 'Need an account? '}<Link to={register ? '/login' : '/register'}>{register ? 'Log in' : 'Register'}</Link></p>
  </section>
}
