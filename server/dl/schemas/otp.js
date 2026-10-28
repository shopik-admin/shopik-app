import regex from "#common/functions/regex.js"

const otpSchema = {
    phone: {
        type: String,
        required: true,
        match: regex.mobilePhone,
        // OTPs are looked up and rate-limited by phone (login, register, edit).
        filter: true
    },
    otp: { type: String, required: true },
    token: { type: String, required: true, filter: 'exact' },
    userId: { type: String, filter: true },
    remember: Boolean,
    attempts: { type: Number, default: 0 },
    payload: Object
}

const index = [
    [
        { createdAt: 1 },
        { expireAfterSeconds: 10 * 60 }
    ],
    { phone: 1, token: 1 }
]

export const meta = {
    index,
    noActive: true,
    noId: true
}

export default otpSchema