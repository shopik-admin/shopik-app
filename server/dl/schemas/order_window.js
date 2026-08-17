const orderWindowSchema = {
    storeId: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true
    },
    dayOfWeek: {
        type: Number,
        required: true
    },
    start: {
        type: Number,
        required: true
    },
    end: {
        type: Number,
        required: true
    },
    maxCapacity: {
        type: Number,
        required: true
    },
    totalOrders: {
        type: Number,
        default: 0
    },
    leadHours: {
        type: Number,
        required: true
    },
    timezone: {
        type: String,
        required: true
    },
    startTimestamp: Date,
    endTimestamp: Date,
    leadTimestamp: Date
}

const index = [
    { storeId: 1, date: 1, start: 1 },
    { date: 1, start: 1 }
]

export const meta = { index }

export default orderWindowSchema
