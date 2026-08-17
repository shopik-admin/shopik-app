const DEPARTMENTS = {
    MARKETING: 'marketing',
    LOGISTICS: 'logistics',
    CUSTOMER_SERVICE: 'customer-service',
    FINANCE: 'finance'
}
const BENEFITS = {
    SUM: 'sum',
    PERCENT: 'percent'
}
const STATUS = {
    ACTIVE: 'active',
    CANCELED: 'canceled'
}

const couponSchema = {
    code: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,
    department: {
        type: String,
        enum: Object.values(DEPARTMENTS),
        required: true,
        default: DEPARTMENTS.MARKETING
    },
    discount: {
        type: Number,
        required: true
    },
    minSum: {
        type: Number,
        required: true
    },
    maxSum: Number,
    multi: {
        type: Boolean,
        default: true
    },
    benefit: {
        type: String,
        required: true,
        enum: Object.values(BENEFITS)
    },
    whitelist: [String],
    blacklist: [String],
    start: {
        type: Date,
        required: true
    },
    end: {
        type: Date,
        required: true
    },
    dynamic: {
        type: Boolean,
        default: false
    },
    condition: {
        orderRange: {
            start: Number,
            end: Number
        },
        lastOrder: {
            start: Date,
            end: Date
        },
        cities: [String],
        emails: [String],
        phones: [String],
        creditCardCompanies: [{
            _id: false,
            name: String,
            firstDigits: String
        }]
    },
    campaignName: String,
    status: {
        type: String,
        default: STATUS.ACTIVE,
        enum: Object.values(STATUS)
    },
    adminId: {
        type: String,
        required: true
    }
}

export const meta = {
    constants: {
        DEPARTMENTS,
        BENEFITS,
        STATUS
    }
}

export default couponSchema