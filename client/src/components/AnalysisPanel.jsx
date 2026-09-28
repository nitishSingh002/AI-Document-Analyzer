export default function AnalysisPanel({ document, busy, analyzing, analysisError, onAnalyze }) {
  return <section className="card document-details" aria-label="Selected document" aria-live="polite">
    <div className="panel-heading"><div><p className="eyebrow">DOCUMENT</p><h2>{document.displayName || 'Selected document'}</h2></div>
      {document.analysis && <span className="complete-pill">Analyzed</span>}</div>
    <div className="document-meta"><span>{document.originalName}</span>{document.createdAt && <time dateTime={document.createdAt}>{new Date(document.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</time>}</div>
    <section className="extracted-section"><div className="section-heading"><h3>Extracted text</h3><span>Preview</span></div>
      {document.extractedTextPreview
        ? <pre className="text-preview">{document.extractedTextPreview}</pre>
        : <div className="text-preview text-preview-empty">Text preview is unavailable for this document.</div>}
    </section>
    <section className="analysis-section" aria-live="polite">
      <div className="section-heading"><div><p className="eyebrow">AI INSIGHTS</p><h3>Document analysis</h3></div>
        {!document.analysis && <button className="button primary analyze-button" type="button" onClick={onAnalyze} disabled={busy}>
          {analyzing && <span className="spinner" aria-hidden="true" />}{analyzing ? 'Analyzing…' : analysisError ? 'Retry analysis' : 'Analyze document'}
        </button>}
      </div>
      {!document.analysis && analyzing && <div className="analysis-loading" role="status" aria-label="Analyzing document">
        <span /><span /><span /><span />
      </div>}
      {!document.analysis && !analyzing && <p className="analysis-empty">Analyze this document to generate insights.</p>}
      {analysisError && <p className="upload-error" role="alert">{analysisError}</p>}
      {document.analysis && <div className="analysis-grid">
        <article className="insight-card summary-card"><h4>AI Summary</h4><p>{document.analysis.summary}</p></article>
        <article className="insight-card"><h4>Document Type</h4><p className="document-type">{document.analysis.documentType}</p></article>
        <article className="insight-card"><h4>Key Points</h4><ul>{document.analysis.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul></article>
        <article className="insight-card"><h4>Important Entities</h4>{document.analysis.entities.length
          ? <ul className="entity-list">{document.analysis.entities.map((entity, index) => <li key={index}>{entity}</li>)}</ul>
          : <p>No notable named entities found.</p>}</article>
      </div>}
    </section>
  </section>
}
