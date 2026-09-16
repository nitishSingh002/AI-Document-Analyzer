import { createDocument, analyzeDocument, askDocument } from '../services/documentService.js'

export async function askUploadedDocument(req, res) {
  res.json(await askDocument(req.params.id, req.body?.question))
}

export async function analyzeUploadedDocument(req, res) {
  const document = await analyzeDocument(req.params.id)
  res.json({ id: document._id, analysis: document.analysis })
}

export async function uploadDocument(req, res) {
  try {
    const document = await createDocument(req.file)
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
