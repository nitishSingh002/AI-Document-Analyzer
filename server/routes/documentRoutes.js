import { Router } from 'express'
import { uploadPdf } from '../middleware/uploadPdf.js'
import { uploadDocument, analyzeUploadedDocument } from '../controllers/documentController.js'

const router = Router()
router.post('/upload', uploadPdf, uploadDocument)
router.post('/:id/analyze', analyzeUploadedDocument)
export default router
