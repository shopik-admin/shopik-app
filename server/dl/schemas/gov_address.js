import { CACHE_STRATEGIES } from '#common/constants.js'

const govAddressSchema = {
    city: {
        type: String,
        required: true,
        trim: true,
        filter: true,
        lowercase: true
    },
    street: {
        type: String,
        trim: true,
        filter: true,
        lowercase: true
    },
    // Synonyms from the national registry ("בן זכאי" → "יוחנן בן זכאי").
    // Searchable, but never offered as the selected street name.
    aliases: {
        type: [String],
        filter: true
    },
    streetCode: String,
    // Stable key of the physical street inside the city; aliases share it.
    officialCode: {
        type: String,
        filter: true
    },
    // True only for a doc created by a synonym whose official row was missing.
    fallback: Boolean
}

export const meta = {
    cacheStrategy: CACHE_STRATEGIES.HASHSET,
    index: [
        { city: 1, street: 1 },
        { city: 1, officialCode: 1 }
    ],
    noActive: true,
    timestamps: false
}

export default govAddressSchema
