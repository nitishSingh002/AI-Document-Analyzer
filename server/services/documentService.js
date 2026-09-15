import { randomUUID } from 'node:crypto'
import { PDFParse } from 'pdf-parse'
import Document from '../models/Document.js'
import { HttpError } from '../utils/HttpError.js'

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
