import { generateEmbeddings, isValidEmbedding } from './embeddingService.js'
import { HttpError } from '../utils/HttpError.js'

// Word boundaries preserve readable context; overlap retains nearby evidence.
export function splitText(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  const words = text.trim().match(/\S{1,100}/gu)
  const chunks = []
  for (let start = 0; start < words.length; start += 180) {
    chunks.push({ chunkIndex: chunks.length, text: words.slice(start, start + 220).join(' ') })
    if (start + 220 >= words.length) break
  }
  return chunks
}

export async function embedDocument(text) {
  const chunks = splitText(text)
  if (!chunks.length) throw new HttpError(422, 'This document has no text chunks to embed.')
  const embeddings = await generateEmbeddings(chunks.map(chunk => chunk.text))
  return chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }))
}

export function hasEmbeddings(chunks) {
  return Array.isArray(chunks) && chunks.length > 0 && chunks.every(chunk =>
    chunk && Number.isInteger(chunk.chunkIndex) && chunk.chunkIndex >= 0 &&
    typeof chunk.text === 'string' && chunk.text.trim() && isValidEmbedding(chunk.embedding))
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length ||
      !a.every(Number.isFinite) || !b.every(Number.isFinite)) throw new HttpError(422, 'Invalid embedding vectors.')
  const normA = Math.hypot(...a), normB = Math.hypot(...b)
  if (!normA || !normB || !Number.isFinite(normA) || !Number.isFinite(normB)) throw new HttpError(422, 'Invalid embedding vectors.')
  return Math.max(-1, Math.min(1, a.reduce((score, value, index) => score + (value / normA) * (b[index] / normB), 0)))
}

export function retrieveContext(chunks, questionEmbedding) {
  if (!hasEmbeddings(chunks) || !isValidEmbedding(questionEmbedding)) throw new HttpError(422, 'No valid document embeddings are available.')
  return chunks.map(chunk => ({ chunkIndex: chunk.chunkIndex, text: chunk.text,
    score: cosineSimilarity(chunk.embedding, questionEmbedding) }))
    .sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex)
    .slice(0, 4).map(({ chunkIndex, text }) => ({ chunkIndex, text }))
}
