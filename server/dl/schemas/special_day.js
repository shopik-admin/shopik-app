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
        required: true
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
    { source: 1, date: 1 }
]

export const meta = {
    index,
    constants: { SOURCE: SPECIAL_SOURCE }
}

export default specialDaySchema
