import { CACHE_STRATEGIES } from '#common/constants.js'

const translationLanguageSchema = {
    code: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        filter: 'exact'
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    nativeName: {
        type: String,
        required: true,
        trim: true
    },
    direction: {
        type: String,
        enum: ['rtl', 'ltr'],
        default: 'rtl',
        filter: 'exact'
    },
    flag: {
        type: String,
        trim: true
    }
}

const index = [
    [{ code: 1 }, { unique: true }]
]

export const meta = { index, cacheStrategy: CACHE_STRATEGIES.HASHSET }

export default translationLanguageSchema
