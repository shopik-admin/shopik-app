const supplyAreaSchema = {
    name: {
        type: String,
        default: '',
        trim: true,
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
        _id: false,
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