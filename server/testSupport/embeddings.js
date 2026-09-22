import { Models } from '@google/genai'

export function vector(x = 1, y = 0) {
  return [x, y, ...Array(766).fill(0)]
}

export function mockEmbeddings(context) {
  return context.mock.method(Models.prototype, 'embedContentInternal', async () => ({ embeddings: [{ values: vector() }] }))
}
