import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Home from './pages/Home.jsx'
import Dashboard from './pages/Dashboard.jsx'

function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<section className="card"><h1>Page not found</h1><p>Use the navigation to return to Home or Dashboard.</p></section>} />
        </Routes>
      </main>
    </>
  )
}

export default App
