import { loginUser, registerUser, publicUser, signSession } from '../services/authService.js'
import { env } from '../config/env.js'

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: env.production, path: '/' }
}
function respondWithSession(res, user, status) {
  const { token, expires } = signSession(user._id)
  res.cookie('session', token, { ...cookieOptions(), expires })
  res.status(status).json({ user: publicUser(user) })
}
export async function register(req, res) {
  respondWithSession(res, await registerUser(req.body), 201)
}
export async function login(req, res) {
  respondWithSession(res, await loginUser(req.body), 200)
}
export function logout(req, res) {
  res.clearCookie('session', cookieOptions())
  res.status(204).end()
}
export function me(req, res) {
  res.json({ user: publicUser(req.user) })
}
