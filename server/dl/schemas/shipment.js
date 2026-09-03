const SHIPMENT_STATUS = {
    ACTIVE: 'active',
    DONE: 'done',
    CANCELED: 'canceled'
}

const shipmentSchema = {
    storeId: { type: String, required: true, filter: true },
    shipper: {
        adminId: String,
        name: String
    },
    orderIds: [String],
    status: {
        type: String,
        enum: Object.values(SHIPMENT_STATUS),
        default: SHIPMENT_STATUS.ACTIVE,
        filter: true
    },
    startedAt: Date,
    completedAt: Date,
    startLocation: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number]
    },
    currentLocation: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number]
    },
    path: [{
        _id: false,
        at: Date,
        coordinates: [Number]
    }],
    routeOrder: [{
        _id: false,
        orderId: String,
        seq: Number
    }],
    proof: [{
        _id: false,
        orderId: String,
        url: String,
        at: Date
    }],
    shipmentNumber: Number
}

export const meta = {
    constants: { SHIPMENT_STATUS },
    index: [
        { storeId: 1, status: 1 },
        { 'shipper.adminId': 1, status: 1 }
    ]
}

export default shipmentSchema
