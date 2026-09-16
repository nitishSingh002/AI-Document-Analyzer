import { Router } from 'express'
import { uploadPdf } from '../middleware/uploadPdf.js'
import { uploadDocument, analyzeUploadedDocument, askUploadedDocument } from '../controllers/documentController.js'

const router = Router()
router.post('/upload', uploadPdf, uploadDocument)
router.post('/:id/analyze', analyzeUploadedDocument)
router.post('/:id/ask', askUploadedDocument)
export default router
