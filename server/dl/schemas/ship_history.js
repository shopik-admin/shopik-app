/**
 * ship_history — location breadcrumb + lifecycle events for a shipment.
 * One row per location ping and per lifecycle milestone (start/deliver/done/cancel/force).
 * Used to replay routes and order lifecycle on a map.
 */
const shipHistorySchema = {
    shipmentId: { type: String, filter: true },
    orderId: { type: String, filter: true },
    storeId: { type: String, filter: true },
    shipperAdminId: { type: String, filter: true },
    shipperName: String,
    type: {
        type: String,
        enum: ['location', 'start', 'deliver', 'done', 'cancel', 'force'],
        required: true,
        filter: true
    },
    location: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number] // [lng, lat]
    },
    at: { type: Date, default: Date.now, filter: true },
    accuracy: Number,
    orderIds: [String], // snapshot of shipment orderIds at this event
    proofUrl: String,
    metadata: {}
}

export const meta = {
    index: [
        { shipmentId: 1, at: 1 },
        { orderId: 1, at: 1 },
        { shipperAdminId: 1, at: -1 },
        { storeId: 1, at: -1 },
        { location: '2dsphere' }
    ]
}

export default shipHistorySchema
