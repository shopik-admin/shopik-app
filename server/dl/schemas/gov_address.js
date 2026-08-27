import { CACHE_STRATEGIES } from '#common/constants.js'

const govAddressSchema = {
    city: {
        type: String,
        required: true,
        trim: true,
        filter: true
    },
    street: {
        type: String,
        trim: true,
        filter: true
    }
}

export const meta = {
    cacheStrategy: CACHE_STRATEGIES.HASHSET,
    index: [
        { city: 1, street: 1 }
    ],
    noActive: true,
    timestamps: false
}

export default govAddressSchema
