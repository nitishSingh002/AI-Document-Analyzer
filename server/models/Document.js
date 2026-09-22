import mongoose from 'mongoose'
import { isValidEmbedding } from '../services/embeddingService.js'

const chunkSchema = new mongoose.Schema({
  chunkIndex: { type: Number, required: true, min: 0, validate: Number.isInteger },
  text: { type: String, required: true, trim: true },
  embedding: { type: [Number], required: true, validate: isValidEmbedding },
}, { _id: false })

const sourceSchema = new mongoose.Schema({
  chunkIndex: { type: Number, required: true, min: 0, validate: Number.isInteger },
  preview: { type: String, required: true, maxlength: 300 },
}, { _id: false })

const chatMessageSchema = new mongoose.Schema({
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true, trim: true, maxlength: 12000 },
  createdAt: { type: Date, required: true, default: Date.now },
  sources: { type: [sourceSchema], default: undefined },
}, { _id: false })

const analysisSchema = new mongoose.Schema({
  summary: { type: String, required: true },
  keyPoints: { type: [String], required: true },
  documentType: { type: String, required: true },
  entities: { type: [String], required: true },
  analyzedAt: { type: Date, required: true },
}, { _id: false })

const documentSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalName: { type: String, required: true },
  displayName: { type: String, trim: true, minlength: 1, maxlength: 200 },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true, enum: ['application/pdf'] },
  size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  extractedText: { type: String, required: true },
  chunks: { type: [chunkSchema], default: [] },
  embeddingModel: { type: String },
  createdAt: { type: Date, default: Date.now, immutable: true },
  analysis: { type: analysisSchema, default: undefined },
  chatHistory: { type: [chatMessageSchema], default: [] },
}, { bufferCommands: false })

export default mongoose.model('Document', documentSchema)
