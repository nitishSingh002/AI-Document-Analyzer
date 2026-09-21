import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function Navbar() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState('')
  async function handleLogout() {
    setLoggingOut(true)
    setError('')
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch { setError('Unable to log out. Please try again.') }
    finally { setLoggingOut(false) }
  }
  return (
    <header className="site-header">
      <nav className="container navigation" aria-label="Main navigation">
        <Link className="brand" to="/">AI Document Analyzer</Link>
        <div className="nav-links">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          {!loading && (user ? <>
            <span className="nav-user" title={user.email}>{user.name}</span>
            <button className="logout-button" type="button" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Logging out...' : 'Logout'}</button>
          </> : <><NavLink to="/login">Login</NavLink><NavLink to="/register">Register</NavLink></>)}
          {error && <span className="upload-error" role="alert">{error}</span>}
        </div>
      </nav>
    </header>
  )
}
