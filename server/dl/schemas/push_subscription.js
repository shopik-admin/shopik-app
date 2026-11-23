// One browser push endpoint per row.
//
// An endpoint identifies a browser installation, not a person: the same
// endpoint can move between admins (a shared store computer) and is re-bound on
// every subscribe. `platform` keeps the door open for a customer app later
// without mixing the two audiences.
const pushSubscriptionSchema = {
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
    platform: {
        type: String,
        required: true,
        default: 'admin',
        filter: true
    },
    endpoint: {
        type: String,
        required: true,
        unique: true,
        maxlength: 2048,
        filter: 'exact'
    },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true }
    },
    expirationTime: Number,
    userAgent: String,
    deviceLabel: String,
    lastSeenAt: Date,
    lastSuccessAt: Date,
    lastFailureAt: Date,
    failureCount: { type: Number, default: 0 },
    // Filterable: the sender selects live endpoints with `disabledAt: null`.
    disabledAt: { type: Date, filter: true },
    lastError: String
}

const index = [
    { adminId: 1, domainId: 1 },
    { domainId: 1, platform: 1, disabledAt: 1 }
]

export const meta = { index }

export default pushSubscriptionSchema
