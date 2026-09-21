import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { bufferCommands: false })

export default mongoose.model('User', userSchema)
