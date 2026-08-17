const windowTemplateSchema = {
    name: String,
    master: {
        type: Boolean,
        default: false
    },
    storeId: String,
    leadHours: {
        type: Number,
        default: 2,
        min: [0, 'leadHours must be at least 0'],
        max: [24, 'leadHours must be less than or equal to 24']
    },
    timezone: {
        type: String,
        default: 'Asia/Jerusalem'
    },
    windows: [{
        _id: false,
        dayOfWeek: {
            type: Number,
            required: true,
            min: [0, 'dayOfWeek must be 0-6'],
            max: [6, 'dayOfWeek must be 0-6']
        },
        leadHours: {
            type: Number,
            min: [0, 'leadHours must be at least 0'],
            max: [24, 'leadHours must be less than or equal to 24']
        },
        start: {
            type: Number,
            required: true,
            min: [0, 'start hour must be 0-23'],
            max: [23, 'start hour must be 0-23']
        },
        end: {
            type: Number,
            required: true,
            min: [1, 'end hour must be 1-23'],
            max: [23, 'end hour must be 0-23']
        },
        maxCapacity: {
            type: Number,
            required: true,
            min: [1, 'maxCapacity must be at least 1'],
            max: [100, 'maxCapacity must be at most 100']
        }
    }]
}

const index = [
    [{ master: 1, storeId: 1 }, { unique: 1 }]
]

export const meta = { index }

export default windowTemplateSchema
