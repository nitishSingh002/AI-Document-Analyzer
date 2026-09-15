import { Router } from 'express'
import { uploadPdf } from '../middleware/uploadPdf.js'
import { uploadDocument } from '../controllers/documentController.js'

const router = Router()
router.post('/upload', uploadPdf, uploadDocument)
export default router
