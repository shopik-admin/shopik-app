const userStatSchema = {
    userId: { type: String, required: true, filter: true },
    domainId: { type: String, filter: true },
    ordersCount: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    refundedTotal: { type: Number, default: 0 },
    canceledCount: { type: Number, default: 0 },
    firstOrderAt: Date,
    lastOrderAt: Date,
    lastOrderId: String,
    lastOrderNumber: String
}

export const meta = {
    index: [
        [{ userId: 1 }, { unique: true }],
        [{ domainId: 1 }]
    ]
}

export default userStatSchema
