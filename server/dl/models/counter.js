import mongoose from 'mongoose'
const { Schema } = mongoose

const counterSchema = new Schema({
    name: { type: String, unique: true },
    value: Number
})

export default mongoose.model('Counter', counterSchema, 'counters')