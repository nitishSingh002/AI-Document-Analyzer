import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <section className="card">
      <p className="eyebrow">AI Document Analyzer</p>
      <h1>A home for your document insights.</h1>
      <p>Welcome to AI Document Analyzer. Your workspace starts here.</p>
      <Link className="button" to="/dashboard">Open dashboard</Link>
    </section>
  )
}
