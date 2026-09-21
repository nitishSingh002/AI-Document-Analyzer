import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function ProtectedRoute({ children }) {
  const { user, loading, error, retry } = useAuth()
  if (loading) return <p role="status">Checking your session...</p>
  if (error) return <section className="card"><p role="alert">{error}</p><button className="button" onClick={retry}>Retry</button></section>
  return user ? children : <Navigate to="/login" replace />
}
