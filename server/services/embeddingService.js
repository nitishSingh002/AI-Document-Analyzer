import { env } from '../config/env.js'
import { HttpError } from '../utils/HttpError.js'
import { requestGemini } from './aiService.js'

export const EMBEDDING_DIMENSIONS = 768

export function isValidEmbedding(vector) {
  return Array.isArray(vector) && vector.length === EMBEDDING_DIMENSIONS &&
    vector.every(value => typeof value === 'number' && Number.isFinite(value)) &&
    Number.isFinite(Math.hypot(...vector)) && Math.hypot(...vector) > 0
}

export async function generateEmbedding(text, purpose = 'document') {
  if (typeof text !== 'string' || !text.trim()) throw new HttpError(422, 'Cannot embed empty text.')
  if (!env.geminiApiKey || !env.geminiEmbeddingModel) {
    throw new HttpError(503, 'Semantic retrieval is not configured. Set GEMINI_API_KEY and GEMINI_EMBEDDING_MODEL on the server.')
  }
  let response
  try {
    response = await requestGemini({
      contents: purpose === 'question'
        ? `task: question answering | query: ${text.trim()}`
        : `title: none | text: ${text.trim()}`,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    }, 'embedContent')
  } catch {
    throw new HttpError(502, 'Document embedding failed. Please try again later.')
  }
  const vector = response?.embeddings?.[0]?.values
  if (response?.embeddings?.length !== 1 || !isValidEmbedding(vector)) {
    throw new HttpError(502, 'AI returned a malformed embedding. Please try again.')
  }
  return vector
}

export async function generateEmbeddings(texts) {
  if (!Array.isArray(texts) || !texts.length || texts.some(text => typeof text !== 'string' || !text.trim())) {
    throw new HttpError(422, 'Cannot embed empty document chunks.')
  }
  const vectors = []
  // Embedding 2 aggregates inputs: request each text separately, at most four at a time.
  for (let start = 0; start < texts.length; start += 4) {
    const results = await Promise.allSettled(texts.slice(start, start + 4).map(text => generateEmbedding(text)))
    const failed = results.find(result => result.status === 'rejected')
    if (failed) throw failed.reason
    vectors.push(...results.map(result => result.value))
  }
  return vectors
}
