import { Router } from 'express'
import { uploadPdf } from '../middleware/uploadPdf.js'
import { uploadDocument, analyzeUploadedDocument, askUploadedDocument, getDocumentHistory, getUploadedDocument } from '../controllers/documentController.js'

const router = Router()
router.get('/', getDocumentHistory)
router.get('/:id', getUploadedDocument)
router.post('/upload', uploadPdf, uploadDocument)
router.post('/:id/analyze', analyzeUploadedDocument)
router.post('/:id/ask', askUploadedDocument)
export default router
