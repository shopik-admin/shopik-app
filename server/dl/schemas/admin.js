import { CACHE_STRATEGIES } from '#common/constants.js'
import regex from '#common/functions/regex.js'

const adminSchema = {
    phone: {
        type: String,
        minlength: 10,
        maxlength: 16,
        trim: true,
        required: true,
        unique: true,
        match: regex.mobilePhone,
        filter: true
    },
    idNum: {
        type: String,
        minlength: 8,
        maxlength: 16,
        trim: true,
        required: true,
        unique: true,
        match: regex.idNum,
        filter: true
    },
    roleId: {
        type: String,
        required: true
    },
    email: {
        type: String,
        match: regex.email,
        lowercase: true,
        required: true,
        filter: true
    },
    name: {
        first: {
            type: String,
            required: true,
            match: regex.name,
            filter: true,
            trim: true
        },
        last: {
            type: String,
            required: true,
            match: regex.name,
            filter: true,
            trim: true
        }
    },
    tokens: { type: {}, select: false },
    lastLogin: Date,
    lastLogout: Date,
    lastLocation: {
        type: {
            type: String,
            default: 'Point',
            enum: ['Point']
        },
        coordinates: [Number]
    },
    avatar: String,
    socketId: String,
    domainIds: [String],
    currentDomainIds: [String],
    storeIds: [String],
    currentStoreId: String,
    notificationSettings: {
        blockedTemplates: [String]
    }
}

export const meta = { cacheStrategy: CACHE_STRATEGIES.HASHSET }

export default adminSchema