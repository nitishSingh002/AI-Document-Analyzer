import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Home from './pages/Home.jsx'
import Dashboard from './pages/Dashboard.jsx'
import AuthPage from './pages/AuthPage.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { useAuth } from './auth/useAuth.js'

function App() {
  const { user } = useAuth()
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<AuthPage key="login" mode="login" />} />
          <Route path="/register" element={<AuthPage key="register" mode="register" />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard key={user?.id} /></ProtectedRoute>} />
          <Route path="*" element={<section className="card"><h1>Page not found</h1><p>Use the navigation to return to Home or Dashboard.</p></section>} />
        </Routes>
      </main>
    </>
  )
}

export default App
