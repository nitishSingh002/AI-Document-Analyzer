export default function UploadPanel({ file, fileInput, busy, loading, error, onSelect, onDrop, onUpload }) {
  return <form className="card upload-area" onSubmit={onUpload} aria-busy={loading}>
    <div className="panel-heading"><div><p className="eyebrow">GET STARTED</p><h2>Upload a document</h2></div><span className="upload-icon" aria-hidden="true">↑</span></div>
    <label className={`drop-zone${file ? ' has-file' : ''}`} htmlFor="pdf-file" onDragOver={event => event.preventDefault()} onDrop={onDrop}>
      <span className="drop-icon" aria-hidden="true">⇧</span>
      <strong>{file ? file.name : 'Drop your PDF here'}</strong>
      <span>or <span className="browse-link">browse files</span></span>
      <small>PDF only · Up to 10 MB</small>
      <input ref={fileInput} id="pdf-file" type="file" accept=".pdf,application/pdf" onChange={onSelect} disabled={busy} aria-describedby="upload-help" />
    </label>
    <p id="upload-help" className="helper-text">Text-based PDFs are supported. Scanned documents need OCR and cannot be read yet.</p>
    <button className="button primary" type="submit" disabled={!file || busy}>{loading ? <><span className="spinner" aria-hidden="true" />Uploading and extracting…</> : 'Upload PDF'}</button>
    {loading && <p className="inline-status" role="status">Please wait while your document is processed.</p>}
    {error && <p className="upload-error" role="alert">{error}</p>}
  </form>
}
