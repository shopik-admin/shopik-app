import { CACHE_STRATEGIES } from '#common/constants.js'

const domainSchema = {
    name: {
        type: String,
        required: true,
        unique: true,
        filter: true
    },
    logo: String,
    url: {
        type: String,
        filter: true
    },
    isDefault: {
        type: Boolean,
        default: false,
        filter: true
    }
}

export const meta = { cacheStrategy: CACHE_STRATEGIES.HASHSET }

export default domainSchema