export default function DocumentHistory({ history, documentId, historyLoading, historyError, retryHistory,
  historyBusy, openingId, openError, managementError, managementStatus, onOpen, onRename, onDelete }) {
  return <aside className="dashboard-history" aria-label="Document history">
    <section className="card document-history" aria-busy={historyLoading || Boolean(openingId) || Boolean(historyBusy)}>
      <div className="panel-heading"><div><p className="eyebrow">LIBRARY</p><h2>Document History</h2></div><span className="item-count">{history.length}</span></div>
      {historyLoading && <p role="status">Loading document history…</p>}
      {historyError && <div><p className="upload-error" role="alert">{historyError}</p>
        <button className="button secondary" type="button" onClick={retryHistory} disabled={historyLoading}>Retry history</button></div>}
      {!historyLoading && !historyError && history.length === 0 && <div className="history-empty">
        <span className="empty-icon" aria-hidden="true">PDF</span><h3>No documents yet</h3>
        <p>Upload a PDF to start analyzing your documents.</p>
      </div>}
      {history.length > 0 && <ul className="history-list">{history.map(item => <li key={item.id} className="history-item">
        <button className="history-document" type="button" aria-pressed={documentId === item.id} disabled={historyBusy}
          onClick={() => onOpen(item.id)}>
          <span className="document-mark" aria-hidden="true">PDF</span><span className="history-document-copy">
            <strong>{item.displayName || item.originalName}</strong>
            {item.displayName && <span className="original-name">{item.originalName}</span>}
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
            {item.analyzed && item.analysis?.documentType && <span className="type-pill">{item.analysis.documentType}</span>}
          </span><span className="selected-indicator" aria-hidden="true">✓</span>
        </button>
        <div className="history-actions">
          <button type="button" disabled={historyBusy} onClick={() => onRename(item)} aria-label={`Rename ${item.displayName || item.originalName}`}>Rename</button>
          <button className="delete-document" type="button" disabled={historyBusy} onClick={() => onDelete(item)} aria-label={`Delete ${item.displayName || item.originalName}`}>Delete</button>
        </div>
      </li>)}</ul>}
      {openingId && <p className="inline-status" role="status">Opening document…</p>}
      {openError && <p className="upload-error" role="alert">{openError}</p>}
      {managementError && <p className="upload-error" role="alert">{managementError}</p>}
      {managementStatus && <p className="inline-status" role="status">{managementStatus}</p>}
    </section>
  </aside>
}
