const KINDS = {
    PRICE: 'price',
    PERCENT: 'percent',
    RECEIVE_AMOUNT: 'receive-amount',
    RECEIVE_PRICE: 'receive-price'
}
const TYPES = {
    PRODUCT: 'product',
    CART: 'cart'
}
const STATUS = {
    ACTIVE: 'active',
    CANCELED: 'canceled',
    DONE: 'done',
    PENDING: 'pending'
}
const notificationSchema = {
    icon: String,
    title: String,
    text: String,
    timeout: Number,
    color: String,
    iconBg: String,
    position: String,
    mobilePosition: String
}

const saleSchema = {
    status: {
        type: String,
        enum: Object.values(STATUS),
        filter: true
    },
    price: Number,
    percent: Number,
    receive: {
        variety: Boolean, // the receive barcodes are idential to the sale.barcodes
        barcodes: [String],
        amount: Number,
        type: { type: String, enum: [KINDS.PERCENT, KINDS.PRICE] },
        percent: Number,
        price: Number,
        onAmountMod: Number,
        autoAdd: Boolean,
        notifications: {
            onReceive: notificationSchema,
            onEligible: notificationSchema,
            onLimit: notificationSchema
        },
        displayTexts: {}
    },
    name: {
        type: String,
        required: true,
        filter: true
    },
    displayName: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: Object.values(TYPES),
        default: TYPES.PRODUCT,
        required: true
    },
    kind: {
        type: String,
        enum: Object.values(KINDS),
        required: true,
        filter: true
    },
    start: {
        type: Date,
        required: true,
        filter: true
    },
    end: {
        type: Date,
        required: true,
        filter: true
    },
    amount: {
        type: Number,
        required: true,
        default: 1,
        min: 1
    },
    limit: {
        type: Number
    },
    description: String,
    barcodes: {
        type: [String],
        required: true
    },
    numOfProducts: Number,
    filter: {
        field: String,
        fieldValue: String,
        subfield: String,
        subfieldValues: [String]
    },
    promotion: {
        desktopImg: String,
        mobilewebImg: String,
        androidImg: String,
        iosImg: String,
        saleSEOName: {
            type: String
        },
        showLinkToSale: {
            type: Boolean,
            default: false
        }
    },
    priority: { type: Number, default: 1 },
    display: {
        headerStrip: {
            imgUrl: String,
            text: String,
            addShadow: Boolean
        },
        productHeader: {
            text: String
        }
    },
    createdBy: String,
    updatedBy: String,
    cancelDate: Date,
    canceledBy: String
}

const defaultSelect = {
    _id: 0,
    id: 1,
    name: 1,
    displayName: 1,
    type: 1,
    kind: 1,
    status: 1,
    start: 1,
    end: 1,
    amount: 1,
    limit: 1,
    price: 1,
    percent: 1,
    barcodes: 1,
    receive: 1
}

export const meta = {
    defaultSelect,
    constants: {
        KINDS,
        TYPES,
        STATUS
    }
}

export default saleSchema