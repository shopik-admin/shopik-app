import regex from "#common/functions/regex.js"

const MAX_ATTEMPTS = 5

const otpSchema = {
    phone: {
        type: String,
        required: true,
        match: regex.mobilePhone
    },
    otp: { type: String, required: true },
    token: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    userId: String,
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
    noId: true,
    constants: { MAX_ATTEMPTS }
}

export default otpSchema