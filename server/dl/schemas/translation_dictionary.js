// One document per language. Keeping the whole dictionary in one map makes a
// language switch a single-document read (and a single-document write), which
// is what keeps mongo out of the SSR hot path. Dotted keys are supported:
// they are object keys, never mongoose/mongo paths.
const translationDictionarySchema = {
    languageCode: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        filter: 'exact'
    },
    texts: {
        type: Object,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}

const index = [
    [{ languageCode: 1 }, { unique: true }]
]

// No DL hash cache: the effective dictionary is cached in Redis by the
// translation layer, and a raw read is a single document per language.
export const meta = { index, timestamps: false }

export default translationDictionarySchema
