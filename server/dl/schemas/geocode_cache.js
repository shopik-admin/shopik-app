import { CACHE_STRATEGIES } from '#common/constants.js'

const geocodeCacheSchema = {
    city: {
        type: String,
        required: true,
        trim: true,
        filter: true
    },
    street: {
        type: String,
        required: true,
        trim: true,
        filter: true
    },
    building: {
        type: String,
        required: true,
        trim: true,
        filter: true
    },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], required: true }
    },
    accuracy: {
        type: String,
        default: 'ROOFTOP'
    }
}

export const meta = {
    cacheStrategy: CACHE_STRATEGIES.HASHSET,
    index: [
        { city: 1, street: 1, building: 1 }
    ],
    noActive: true,
    timestamps: true
}

export default geocodeCacheSchema
