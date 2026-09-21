import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/authRoutes.js'
import { HttpError } from './utils/HttpError.js'
import { env } from './config/env.js'
import healthRoutes from './routes/healthRoutes.js'
import documentRoutes from './routes/documentRoutes.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

app.disable('x-powered-by')
app.use(cors({ origin: env.clientUrl, credentials: true }))
app.use(cookieParser())
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== env.clientUrl) {
    throw new HttpError(403, 'Request origin is not allowed.')
  }
  next()
})
app.use(express.json({ limit: '1mb' }))
app.use('/api', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/documents', documentRoutes)
app.use(notFound)
app.use(errorHandler)

export default app
