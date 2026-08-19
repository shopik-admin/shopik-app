import regex from '#common/functions/regex.js'
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
        zip: String,
        location: {
            type: { type: String, default: 'Point', enum: ['Point'] },
            coordinates: [Number]
        },
        accuracy: String
    },
    phone: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        match: regex.email
    },
    contactName: String,
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
    tag: {
        type: String,
        required: true,
        uppercase: true,
        filter: true
    },
    mapImage: String,
    mapUrl: {
        type: String,
        //  required: true
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