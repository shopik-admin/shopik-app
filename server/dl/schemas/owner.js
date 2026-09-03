const OWNER_STATUS = {
    ACTIVE: 'active',
    READY: 'ready',
    PAUSE: 'pause',
    ON_HOLD: 'on-hold',
    FREE: 'free',
    CUSTOMER_PENDING: 'customer-pending',
    CUSTOMER_APPROVED: 'customer-approved',
    MANAGER_PENDING: 'manager-pending',
    MANAGER_APPROVED: 'manager-approved',
    MANAGER_EXCEPTIONS: 'manager-exceptions',
    DONE: 'done'
}

const ownerSchema = {
    orderId: { type: String, required: true, filter: true },
    adminId: { type: String, required: true, filter: true },
    adminName: String,
    start: Date,
    end: Date,
    extendTimes: Number,
    type: {
        type: String,
        enum: ['picking', 'packing', 'shipping'],
        filter: true
    },
    status: {
        type: String,
        enum: Object.values(OWNER_STATUS),
        filter: true
    }
}

export const meta = {
    constants: { OWNER_STATUS },
    index: [
        { orderId: 1, type: 1 },
        { adminId: 1, status: 1 }
    ]
}

export default ownerSchema
