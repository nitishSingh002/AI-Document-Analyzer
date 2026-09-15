import mongoose from 'mongoose'

const documentSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true, enum: ['application/pdf'] },
  size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  extractedText: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { bufferCommands: false })

export default mongoose.model('Document', documentSchema)
