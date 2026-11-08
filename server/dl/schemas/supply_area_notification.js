import regex from '#common/functions/regex.js'

// "Notify me when the service reaches my area" requests from the delivery
// popover. Kept in its own collection so the address book and user document
// stay untouched, and so ops can later query pending requests by area.
const addressSchema = {
    city: String,
    street: String,
    building: Number,
    apartment: Number,
    areaId: String,
    location: {
        type: { type: String, default: 'Point', enum: ['Point'] },
        coordinates: [Number]
    }
}

const supplyAreaNotificationSchema = {
    email: {
        type: String,
        required: true,
        match: regex.email,
        lowercase: true,
        trim: true,
        filter: true
    },
    userId: {
        type: String,
        filter: true
    },
    // Normalized email+address identity, used to dedupe repeat submissions.
    addressKey: {
        type: String,
        required: true,
        filter: true
    },
    address: addressSchema,
    status: {
        type: String,
        enum: ['pending', 'notified'],
        default: 'pending'
    },
    notifiedAt: Date
}

export const meta = {
    index: [
        [{ email: 1, addressKey: 1 }, { unique: true }],
        [{ status: 1, createdAt: 1 }],
        [{ userId: 1 }]
    ]
}

export default supplyAreaNotificationSchema
