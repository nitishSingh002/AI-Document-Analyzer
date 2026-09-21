import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { env } from '../config/env.js'
import { HttpError } from '../utils/HttpError.js'

export async function authenticate(req, res, next) {
  const token = req.cookies?.session
  if (!token) throw new HttpError(401, 'Please log in to continue.')
  if (env.jwtSecret.length < 32) throw new HttpError(503, 'Authentication is not configured.')
  let payload
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'],
      issuer: 'ai-document-analyzer', audience: 'ai-document-analyzer' })
    if (typeof payload.sub !== 'string' || !/^[a-f\d]{24}$/i.test(payload.sub)) throw new Error()
  } catch {
    throw new HttpError(401, 'Please log in to continue.')
  }
  try {
    req.user = await User.findById(payload.sub)
  } catch {
    throw new HttpError(503, 'Unable to verify your session. Please try again.')
  }
  if (!req.user) throw new HttpError(401, 'Please log in to continue.')
  next()
}
