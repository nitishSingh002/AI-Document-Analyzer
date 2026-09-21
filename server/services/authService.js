import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import User from '../models/User.js'
import { env } from '../config/env.js'
import { HttpError } from '../utils/HttpError.js'

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
}).strict()
const registration = credentials.extend({ name: z.string().trim().min(1).max(100) })
const dummyHash = bcrypt.hash('unused comparison password', 12)

export function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt }
}

export function signSession(userId) {
  if (env.jwtSecret.length < 32) throw new HttpError(503, 'Authentication is not configured. Set JWT_SECRET to at least 32 random characters.')
  try {
    const token = jwt.sign({}, env.jwtSecret, {
      subject: String(userId), algorithm: 'HS256', expiresIn: env.jwtExpiresIn,
      issuer: 'ai-document-analyzer', audience: 'ai-document-analyzer',
    })
    const expires = new Date(jwt.decode(token).exp * 1000)
    if (expires <= new Date()) throw new Error('Invalid expiry')
    return { token, expires }
  } catch {
    throw new HttpError(503, 'Authentication expiry is not configured correctly.')
  }
}

export async function registerUser(body) {
  const parsed = registration.safeParse(body)
  if (!parsed.success) throw new HttpError(400, 'Provide a name, valid email, and password of at least 8 characters (maximum 72 UTF-8 bytes).')
  signSession('configuration-check')
  const { name, email, password } = parsed.data
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    return await User.create({ name, email, passwordHash })
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'An account with this email already exists.')
    throw new HttpError(503, 'Unable to register. Please try again.')
  }
}

export async function loginUser(body) {
  const parsed = credentials.safeParse(body)
  if (!parsed.success) throw new HttpError(400, 'Provide a valid email and password.')
  signSession('configuration-check')
  let user
  try {
    user = await User.findOne({ email: parsed.data.email }).select('+passwordHash')
  } catch {
    throw new HttpError(503, 'Unable to log in. Please try again.')
  }
  const matches = await bcrypt.compare(parsed.data.password, user?.passwordHash || await dummyHash)
  if (!user || !matches) throw new HttpError(401, 'Invalid email or password.')
  return user
}
