// The admin notification inbox.
//
// A row is per recipient, so "read" is a personal state and two admins on the
// same event keep independent histories. Push delivery is best effort and never
// owns the row: an inbox row exists even when the browser never accepted the
// notification, so the bell still shows what happened.
//
// `dedupeKey` is unique per admin, which is what makes an event idempotent
// across retries and concurrent workers.
const adminNotificationSchema = {
    adminId: {
        type: String,
        required: true,
        filter: true
    },
    domainId: {
        type: String,
        required: true,
        filter: true
    },
    storeId: { type: String, filter: true },
    type: {
        type: String,
        required: true,
        filter: true
    },
    level: {
        type: String,
        enum: ['info', 'success', 'warning', 'error'],
        default: 'info',
        filter: true
    },
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    body: {
        type: String,
        maxlength: 500
    },
    url: String,
    orderId: { type: String, filter: true },
    orderNumber: { type: String, filter: true },
    windowDate: String,
    windowStart: Number,
    windowEnd: Number,
    dedupeKey: {
        type: String,
        required: true,
        filter: 'exact'
    },
    readAt: { type: Date, filter: true },
    pushedAt: Date
}

const index = [
    { adminId: 1, createdAt: -1 },
    { adminId: 1, readAt: 1 },
    [{ adminId: 1, dedupeKey: 1 }, { unique: true }]
]

export const meta = { index }

export default adminNotificationSchema
