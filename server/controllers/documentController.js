import { createDocument, analyzeDocument, askDocument, listDocuments, getDocument, getDocumentChat } from '../services/documentService.js'

export async function getUploadedDocumentChat(req, res) {
  res.json(await getDocumentChat(req.params.id, req.user._id))
}

export async function getDocumentHistory(req, res) {
  const documents = await listDocuments(req.user._id)
  res.json(documents.map(document => ({
    id: document._id,
    originalName: document.originalName,
    size: document.size,
    createdAt: document.createdAt,
    ...(document.analysis?.documentType ? { analysis: { documentType: document.analysis.documentType } } : {}),
    analyzed: Boolean(document.analysis),
  })))
}

export async function getUploadedDocument(req, res) {
  const document = await getDocument(req.params.id, req.user._id)
  res.json({
    id: document._id,
    originalName: document.originalName,
    size: document.size,
    mimeType: document.mimeType,
    createdAt: document.createdAt,
    extractedText: document.extractedText,
    analysis: document.analysis ?? null,
  })
}

export async function askUploadedDocument(req, res) {
  res.json(await askDocument(req.params.id, req.body?.question, req.user._id))
}

export async function analyzeUploadedDocument(req, res) {
  const document = await analyzeDocument(req.params.id, req.user._id)
  res.json({ id: document._id, analysis: document.analysis })
}

export async function uploadDocument(req, res) {
  try {
    const document = await createDocument(req.file, req.user._id)
    res.status(201).json({
      id: document._id,
      originalName: document.originalName,
      size: document.size,
      extractedTextPreview: document.extractedText.slice(0, 1000),
      createdAt: document.createdAt,
    })
  } finally {
    // The parser uses memory only; release our reference after success or failure.
    if (req.file) delete req.file.buffer
  }
}
