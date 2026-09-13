import mongoose from 'mongoose'
import app from './app.js'
import { env } from './config/env.js'
import { connectDB } from './config/db.js'

async function startServer() {
  await connectDB()

  const server = app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`)
  })

  server.on('error', () => {
    console.error('HTTP server failed to start. Check the port and permissions.')
    process.exit(1)
  })

  let shuttingDown = false
  function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    const timeout = setTimeout(() => process.exit(1), 10000)
    timeout.unref()
    server.close(async (error) => {
      try {
        await mongoose.disconnect()
        process.exit(error ? 1 : 0)
      } catch {
        process.exit(1)
      }
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startServer().catch(() => {
  console.error('Startup failed. Check MONGODB_URI and MongoDB availability.')
  process.exit(1)
})
