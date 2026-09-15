import mongoose from 'mongoose'

const analysisSchema = new mongoose.Schema({
  summary: { type: String, required: true },
  keyPoints: { type: [String], required: true },
  documentType: { type: String, required: true },
  entities: { type: [String], required: true },
  analyzedAt: { type: Date, required: true },
}, { _id: false })

const documentSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true, enum: ['application/pdf'] },
  size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  extractedText: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
  analysis: { type: analysisSchema, default: undefined },
}, { bufferCommands: false })

export default mongoose.model('Document', documentSchema)
