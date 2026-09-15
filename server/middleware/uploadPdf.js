import multer from 'multer'
import path from 'node:path'
import { HttpError } from '../utils/HttpError.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter(req, file, callback) {
    if (file.mimetype !== 'application/pdf' || path.extname(file.originalname).toLowerCase() !== '.pdf') {
      return callback(new HttpError(415, 'Only PDF files with a .pdf extension and application/pdf MIME type are allowed.'))
    }
    callback(null, true)
  },
}).single('file')

export function uploadPdf(req, res, next) {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      return next(new HttpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        error.code === 'LIMIT_FILE_SIZE' ? 'PDF must be 10 MB or smaller.' : 'Upload exactly one PDF using the file field, with no extra fields.'))
    }
    if (error instanceof HttpError) return next(error)
    if (error) return next(new HttpError(400, 'Invalid multipart upload.', { cause: error }))
    if (!req.file) return next(new HttpError(400, 'Select a PDF file to upload.'))
    next()
  })
}
