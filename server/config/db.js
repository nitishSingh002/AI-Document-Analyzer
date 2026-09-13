import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDB() {
  if (!env.mongodbUri) {
    console.warn('MONGODB_URI is empty. Starting without a database connection.')
    return
  }

  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 })
  console.log('MongoDB connected')
}
