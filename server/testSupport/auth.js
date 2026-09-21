import { beforeEach } from 'node:test'
import User from '../models/User.js'
import { env } from '../config/env.js'
import { signSession } from '../services/authService.js'

export const ownerId = '607f1f77bcf86cd799439011'
beforeEach(context => {
  env.jwtSecret = 'test-only-secret-not-for-production-123456789'
  context.mock.method(User, 'findById', async () => ({ _id: ownerId, name: 'Test', email: 'test@example.com' }))
})
export function authenticatedFetch(url, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('Cookie', `session=${signSession(ownerId).token}`)
  return globalThis.fetch(url, { ...options, headers })
}
