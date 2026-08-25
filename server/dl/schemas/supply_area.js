const supplyAreaSchema = {
    key: {
        type: String,
        trim: true
    },
    name: {
        type: String,
        default: '',
        trim: true,
        filter: true
    },
    description: {
        type: String,
        filter: true
    },
    location: {
        type: {
            type: String,
            required: true,
            default: 'Polygon',
            enum: ['Polygon']
        },
        coordinates: {
            type: [[[Number]]], // [[[lng, lat], ...]]
            required: true
        }
    },
    stores: [{
        storeId: {
            type: String,
            required: true,
            filter: true
        }
    }]
}

export const meta = {
    index: [
        { location: '2dsphere' }
    ]
}
export default supplyAreaSchema