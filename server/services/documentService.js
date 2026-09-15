import { randomUUID } from 'node:crypto'
import { PDFParse } from 'pdf-parse'
import Document from '../models/Document.js'
import { HttpError } from '../utils/HttpError.js'
import { analyzeText } from './aiService.js'

export async function analyzeDocument(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'Invalid document ID.')
  let document
  try {
    document = await Document.findById(id)
  } catch (error) {
    throw new HttpError(503, 'Unable to load the document. Please try again.', { cause: error })
  }
  if (!document) throw new HttpError(404, 'Document not found.')
  if (!document.extractedText?.trim()) throw new HttpError(422, 'This document has no extracted text to analyze.')

  const result = await analyzeText(document.extractedText)
  let updated
  try {
    updated = await Document.findByIdAndUpdate(id, {
      $set: { analysis: { ...result, analyzedAt: new Date() } },
    }, { new: true, runValidators: true })
  } catch (error) {
    throw new HttpError(503, 'Unable to save the analysis. Please try again.', { cause: error })
  }
  if (!updated) throw new HttpError(404, 'Document no longer exists.')
  return updated
}

export async function createDocument(file) {
  let parser
  let extractedText
  try {
    if (!file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
      throw new Error('Missing PDF signature')
    }
    parser = new PDFParse({ data: file.buffer, isEvalSupported: false })
    const result = await parser.getText({ pageJoiner: '' })
    extractedText = result.text.trim()
  } catch (error) {
    throw new HttpError(422, 'Unable to read this PDF. It may be damaged or password-protected.', { cause: error })
  } finally {
    if (parser) await parser.destroy().catch(() => {})
  }

  if (!extractedText) {
    throw new HttpError(422, 'No text could be extracted. Scanned or image-only PDFs require OCR, which is not supported yet.')
  }

  try {
    return await Document.create({
      originalName: file.originalname,
      fileName: `${randomUUID()}.pdf`,
      mimeType: file.mimetype,
      size: file.size,
      extractedText,
    })
  } catch (error) {
    throw new HttpError(503, 'Unable to save the document. Check the database connection and try again.', { cause: error })
  }
}
