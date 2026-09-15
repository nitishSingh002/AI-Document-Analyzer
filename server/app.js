import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import healthRoutes from './routes/healthRoutes.js'
import documentRoutes from './routes/documentRoutes.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

app.disable('x-powered-by')
app.use(cors({ origin: env.clientUrl }))
app.use(express.json({ limit: '1mb' }))
app.use('/api', healthRoutes)
app.use('/api/documents', documentRoutes)
app.use(notFound)
app.use(errorHandler)

export default app
