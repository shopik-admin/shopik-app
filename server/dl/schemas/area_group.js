const areaGroupSchema = {
    name: {
        type: String,
        required: true,
        trim: true,
        filter: true
    },
    storeId: {
        type: String,
        required: true,
        filter: true
    },
    areaIds: [String]
}

export default areaGroupSchema
