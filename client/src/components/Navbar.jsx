import { Link, NavLink } from 'react-router-dom'

export default function Navbar() {
  return (
    <header className="site-header">
      <nav className="container navigation" aria-label="Main navigation">
        <Link className="brand" to="/">AI Document Analyzer</Link>
        <div className="nav-links">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
        </div>
      </nav>
    </header>
  )
}
