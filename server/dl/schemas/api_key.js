import { CACHE_STRATEGIES } from '#common/constants.js'

const apiKeySchema = {
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 100,
        filter: true
    },
    domainId: {
        type: String,
        required: true,
        filter: true
    },
    keyHash: {
        type: String,
        required: true,
        unique: true,
        select: false
    },
    keyPrefix: {
        type: String,
        required: true,
        filter: true
    },
    permissions: {
        type: [String],
        default: []
    },
    active: {
        type: Boolean,
        default: true,
        filter: true
    },
    createdBy: {
        type: String,
        filter: true
    },
    lastUsedAt: {
        type: Date,
        filter: true
    }
}

export const meta = {
    cacheStrategy: CACHE_STRATEGIES.HASHSET,
    index: [
        [{ domainId: 1, name: 1 }, { unique: true }]
    ]
}

export default apiKeySchema
