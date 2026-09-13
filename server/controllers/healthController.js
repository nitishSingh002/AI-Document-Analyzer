import mongoose from 'mongoose'

export function getHealth(req, res) {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting']

  res.status(200).json({
    status: 'ok',
    message: 'AI Document Analyzer API is running',
    database: states[mongoose.connection.readyState] || 'unknown',
  })
}
