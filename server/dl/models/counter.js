import mongoose from 'mongoose'
const { Schema } = mongoose

const counterSchema = new Schema({
    name: { type: String, required: true, unique: true },
    value: {
        type: Number,
        default: 10000000
    }
})

export default mongoose.model('Counter', counterSchema, 'counters')