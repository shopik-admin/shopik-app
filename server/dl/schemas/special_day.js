import { CACHE_STRATEGIES } from "#common/constants.js"

const SPECIAL_SOURCE = {
    MANUAL: 'manual',
    HEBCAL: 'hebcal'
}

const specialDaySchema = {
    name: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true,
        filter: true
    },
    storeIds: [String],
    start: Number,
    end: Number,
    source: {
        type: String,
        enum: Object.values(SPECIAL_SOURCE),
        default: SPECIAL_SOURCE.MANUAL
    },
    createdBy: String
}

const index = [
    { date: 1, storeIds: 1 },
    { active: 1, date: 1 }
]

export const meta = {
    index,
    constants: { SOURCE: SPECIAL_SOURCE },
    cacheStrategy: CACHE_STRATEGIES.HASHSET
}

export default specialDaySchema
