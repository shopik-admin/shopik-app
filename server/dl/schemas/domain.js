import { CACHE_STRATEGIES } from '#common/constants.js'

const domainSchema = {
    name: {
        type: String,
        required: true,
        unique: true,
        filter: true
    },
    logo: String
}

export const meta = { cacheStrategy: CACHE_STRATEGIES.HASHSET }

export default domainSchema