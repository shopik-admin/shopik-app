const supplyAreaSchema = {
    key: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: String,
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
            required: true
        }
    }]
}

export const meta = {
    index: [
        { location: '2dsphere' }
    ]
}
export default supplyAreaSchema