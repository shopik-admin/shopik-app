import { CACHE_STRATEGIES } from '#common/constants.js'

const DELIVERY_METHOD = {
    DELIVERY: 'delivery',
    PICKUP: 'pickup'
}

const storeSchema = {
    name: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        city: {
            type: String,
            required: true
        },
        street: {
            type: String,
            required: true
        },
        building: {
            type: Number,
            required: true
        },
        location: {
            type: { type: String, default: 'Point', enum: ['Point'] },
            coordinates: [Number]
        },
        accuracy: String
    },
    test: {
        type: Boolean,
        default: false
    },
    deliveryMethods: {
        type: [String],
        default: [DELIVERY_METHOD.DELIVERY],
        enum: Object.values(DELIVERY_METHOD),
        filter: true
    },
    mapImage: String,
    mapUrl: {
        type: String,
    }
}

export const constants = {
    DELIVERY_METHOD
}
export const meta = {
    constants,
    cacheStrategy: CACHE_STRATEGIES.HASHSET,
    index: [
        { 'address.location': '2dsphere' }
    ]
}

export default storeSchema