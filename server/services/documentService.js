import { randomUUID } from 'node:crypto'
import { PDFParse } from 'pdf-parse'
import Document from '../models/Document.js'
import { HttpError } from '../utils/HttpError.js'
import { analyzeText, answerQuestion } from './aiService.js'
import { retrieveContext } from './retrievalService.js'

export async function listDocuments() {
  try {
    return await Document.find({}, 'originalName size createdAt analysis.documentType')
      .sort({ createdAt: -1, _id: -1 }).lean()
  } catch (error) {
    throw new HttpError(503, 'Unable to load document history. Please try again.', { cause: error })
  }
}

export async function getDocument(id) {
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'Invalid document ID.')
  let document
  try {
    document = await Document.findById(id)
  } catch (error) {
    throw new HttpError(503, 'Unable to load the document. Please try again.', { cause: error })
  }
  if (!document) throw new HttpError(404, 'Document not found.')
  return document
}

export async function askDocument(id, question) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'Invalid document ID.')
  if (typeof question !== 'string' || !question.trim()) throw new HttpError(400, 'Question must be a non-empty string.')
  if (question.length > 2000) throw new HttpError(400, 'Question must be 2000 characters or fewer.')
  let document
  try {
    document = await Document.findById(id)
  } catch {
    throw new HttpError(503, 'Unable to load the document. Please try again.')
  }
  if (!document) throw new HttpError(404, 'Document not found.')
  if (!document.extractedText?.trim()) throw new HttpError(422, 'This document has no extracted text to answer questions.')
  const chunks = retrieveContext(document.extractedText, question.trim())
  const answer = chunks.length
    ? await answerQuestion(question.trim(), chunks)
    : 'This information is not available in the document.'
  const result = {
    answer,
    sources: chunks.map(({ chunkIndex, text }) => ({ chunkIndex, preview: text.slice(0, 300) })),
  }
  const createdAt = new Date()
  let saved
  try {
    // Append the complete exchange atomically so concurrent requests cannot lose
    // messages or interleave a question with another request's answer.
    saved = await Document.updateOne({ _id: id }, { $push: { chatHistory: { $each: [
      { role: 'user', content: question.trim(), createdAt },
      { role: 'assistant', content: answer, createdAt, sources: result.sources },
    ] } } }, { runValidators: true })
  } catch (error) {
    throw new HttpError(503, 'Unable to save chat history. Please try again.', { cause: error })
  }
  if (!saved.matchedCount) throw new HttpError(404, 'Document not found.')
  return result
}

export async function getDocumentChat(id) {
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'Invalid document ID.')
  let document
  try {
    document = await Document.findById(id, 'chatHistory').lean()
  } catch (error) {
    throw new HttpError(503, 'Unable to load chat history. Please try again.', { cause: error })
  }
  if (!document) throw new HttpError(404, 'Document not found.')
  const history = document.chatHistory === undefined ? [] : document.chatHistory
  if (!Array.isArray(history) || history.some(message => !message ||
    !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' ||
    !message.content.trim() || message.content.length > (message.role === 'user' ? 2000 : 12000) ||
    !(message.createdAt instanceof Date) || !Number.isFinite(message.createdAt.getTime()) ||
    (message.sources !== undefined && (!Array.isArray(message.sources) || message.sources.some(source =>
      !source || !Number.isInteger(source.chunkIndex) || source.chunkIndex < 0 ||
      typeof source.preview !== 'string' || !source.preview.trim() || source.preview.length > 300))))) {
    throw new HttpError(422, 'Stored chat history is malformed.')
  }
  // MongoDB array order is the chronological order of committed exchanges.
  return history.map(({ role, content, createdAt, sources }) => ({
    role, content, createdAt, ...(sources === undefined ? {} : { sources }),
  }))
}

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
    }, { returnDocument: 'after', runValidators: true })
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
