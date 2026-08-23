import uid from '#common/functions/uid.js'
import Counter from '../models/counter.js'
import { constants as productConstants } from './product.js'
import { constants as storeConstants } from './store.js'
const { DELIVERY_METHOD } = storeConstants

const CART_PRODUCT_STATUS = {
    ADMIN_ADD: 'admin_add',
    CLIENT_ADD: 'client_add'
}


const CASH_REGISTER_STATUS = {
    PENDING: 'pending',
    FAILED: 'failed',
    SUCCESS: 'success'
}

const USER_APPROVAL = {
    KOSHER_PENDING: 'kosher-pending',
    KOSHER_APPROVED: 'kosher-approved'
}

const TIME_LINE = {
    ORDER_STATUS_UPDATE: 'order_status',
    ORDER_WINDOW: 'order_window',
    ORDER_COUPON: 'order_coupon',
    ORDER_DETAILS: 'order_details',
    ORDER_DELIVERY: 'order_delivery',
    ORDER_PRODUCT: 'order_product',
    REFUND: 'refund',
    CHANGE: 'change',
    PAYMENT: 'payment',
    RESTORE: 'restore',
    INVOICE_OPEN: 'invoice_open',
    INVOICE_CLOSE: 'invoice_close',
    INVOICE_SEND: 'invoice_send',
    CASH_REGISTER: 'cash_register',
    ORDER_NOTIFY: 'order_notify',
    ORDER_ADDRESS: 'order_address',
    EXTERNAL_COUPON: 'external_coupon',
    SMS_MESSAGE: 'sms_message'
}

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

const ORDER_STATUS = {
    PENDING: 'pending',
    CART: 'cart',
    PAID: 'paid',
    PAID_EDIT: 'paid-edit',
    pick: 'pick',
    READY: 'ready',
    SHIPPED: 'shipped',
    DONE: 'done',
    CANCELED: 'canceled',
    FAILED: 'failed'
}

const PICKUP_STATUS = {
    PENDING: 'pending',
    ON_THE_WAY: 'on-the-way',
    ARRIVED: 'arrived',
    DONE: 'done'
}

const constants = {
    CASH_REGISTER_STATUS,
    USER_APPROVAL,
    TIME_LINE,
    OWNER_STATUS,
    ORDER_STATUS,
    PICKUP_STATUS,
    CART_PRODUCT_STATUS,
    DELIVERY_METHOD
}

const invoiceSchema = {
    number: String,
    url: String,
    shortUrl: String
}

const priceDistributionSchema = {
    type: { type: String }, // sale / regular
    totalSum: Number,
    amount: Number,
    saleName: String,
    salePrice: Number,
    saleLimit: Number,
    saleId: String,
    saleKind: String,
    saleAmount: Number
}

const adminSchema = {
    adminId: String,
    name: String
}

const windowSchema = {
    id: String,
    date: String,
    start: Number,
    end: Number,
    reservedAt: Date,
    startTimestamp: Date,
    endTimestamp: Date,
    leadTimestamp: Date
}

const replacementSuggestionsSchema = {
    barcode: String,
    amount: Number,
    approval: {
        admin: adminSchema,
        user: { userId: String, name: String },
        time: Date
    }
}

const noteGroupSchema = {
    noteGroupName: String,
    noteGroupTag: String,
    name: String,
    options: [{
        id: String,
        text: String,
        value: String
    }]
}

const unitOptionSchema = {
    key: String, // small | medium | large
    name: String, // e.g. 'גדול (כ-10 ק"ג)'
    amount: Number // weight in baseUnit, e.g. 10 (kg)
}

const cartSchema = [{
    id: String,
    barcode: String,
    amount: Number,
    finalAmount: Number,
    price: Number,
    totalSum: Number,
    regularSum: Number,
    saleSum: Number,
    saleIds: [String],
    status: {
        type: String,
        enum: Object.values(CART_PRODUCT_STATUS)
    },
    priceDistribution: [priceDistributionSchema],
    replacement: {
        suggestions: [replacementSuggestionsSchema],
        originalBarcode: String, // on the replacing product
        replacementBarcode: String // on the replaced product
    },
    missing: Boolean,
    missingReason: String,
    updatedAt: Date,
    userApproval: {
        type: String,
        enum: Object.values(USER_APPROVAL)
    },
    admins: [{
        adminId: String,
        date: {
            type: Date,
            default: Date.now
        },
        amount: Number,
        missing: Boolean,
        status: String
    }],
    storageType: String,
    alert: {},
    selectedNoteGroups: [noteGroupSchema],
    unit: {
        type: {
            type: String,
            enum: Object.values(productConstants.UNIT)
        },
        baseUnit: {
            type: String,
            enum: Object.values(productConstants.BASE_UNIT)
        },
        units: Number, // count of units ordered (e.g. 2 watermelons)
        option: unitOptionSchema
    },
    shelfLife: Number,
    shelfLifeDate: Date
}]

const orderSchema = {
    domainId: String,
    storeId: String,
    storeName: String,
    userId: String,
    cart: cartSchema,
    sales: Object,
    time: {
        type: Date,
        default: Date.now
    },
    address: {
        areaId: String,
        city: String,
        street: String,
        building: Number,
        apartment: Number,
        entrance: String,
        floor: String,
        location: {
            type: { type: String, enum: ['Point'] },
            coordinates: { type: [Number], default: undefined }
        },
        comment: String,
        residenceType: String
    },
    deliveryMethod: {
        type: String,
        enum: Object.values(DELIVERY_METHOD),
        default: DELIVERY_METHOD.DELIVERY
    },
    window: windowSchema,
    pickBy: Date,
    shipBy: Date,
    phone: String,
    phoneB: String,
    email: String,
    name: {
        first: String,
        last: String
    },
    status: {
        type: String,
        enum: Object.values(ORDER_STATUS),
        default: ORDER_STATUS.CART
    },
    sum: {
        type: Number,
        default: 0
    },
    sumNoCoupon: Number,
    finalSum: Number,
    finalSumNoCoupon: Number,
    coupons: [{
        code: String,
        discount: Number,
        percent: Boolean,
        minSum: Number,
        maxSum: Number,
        couponMessages: {
            sectionMessage: {
                text: String
            },
            checkOutMessage: {
                icon: String,
                title: String,
                text: String
            }
        },
        checkOnPay: Boolean
    }],
    number: {
        type: String,
        unique: true,
        required: true
    },
    replaceProducts: {
        type: Boolean,
        default: false
    },
    replaceProductsNoCall: {
        type: Boolean,
        default: false
    },
    leaveOrderAtDoor: {
        type: Boolean,
        default: false
    },
    paid: {
        type: Boolean,
        default: false
    },
    invoice: invoiceSchema,
    receipt: {
        url: String,
        shortUrl: String,
    },
    storeProductListUrl: String,
    paidAt: Date,
    paidOrderUpdatedAt: Date,
    paymentError: String,
    invoiceError: String,
    cancelReason: String,
    pickTargetDuration: Number,
    pickStart: Date,
    pickEnd: Date,
    finalSumAfterRefunds: Number,
    comment: String,
    origin: {
        client: String,
        platform: String,
        os: String,
        device: String,
        browser: String
    },
    paymentAttempts: { type: Number, default: 0 },
    orderPickupToken: { type: String, default: () => uid() },
    notifications: {
        userOnTheWay: { type: Number, default: 0 },
        userArrived: { type: Number, default: 0 },
        notifyUserSms: { type: Number, default: 0 }
    },
    tag: String,
    tagHistory: [{
        _id: false,
        oldTag: String,
        newTag: String,
        source: String,
        createdAt: { type: Date, default: Date.now }
    }],
    deliveryDetails: {
        clientETA: Date,
        clientArrivalState: {
            type: String,
            enum: Object.values(PICKUP_STATUS),
            default: 'pending'
        },
        deliveryDate: Date
    },
    picker: adminSchema,
    pickFinalizer: adminSchema,
    shipper: adminSchema,
    orderFinalizer: adminSchema,
    supplyPassoverProductsOnly: { type: Boolean, default: false },
    tempCartId: String,
    customerUpdatedAt: Date,
    originalSum: Number,
    sumWithShippingAndHandling: Number,
    finalSumWithShippingAndHandling: Number,
    initialShippingAndHandling: Number,
    finalShippingAndHandling: Number,
    updateReason: String,
    userOrderNumber: Number,
    orderRestoredFrom: {
        orderNumber: Number,
        orderId: String,
        restoredAt: Date,
        adminId: String
    },
    orderRestoredTo: [
        {
            orderNumber: Number,
            orderId: String,
            restoredAt: Date,
            adminId: String
        }
    ],
    cancelDate: Date,
    firstCheckoutDate: Date,
    productStorage: {
        regular: { type: Number, default: 0 },
        cold: { type: Number, default: 0 },
        freeze: { type: Number, default: 0 },
        extra: { type: Number, default: 0 }
    },
    bags: {
        regular: { type: Number, default: 0 },
        cold: { type: Number, default: 0 },
        freeze: { type: Number, default: 0 },
        extra: { type: Number, default: 0 }
    },
    boxes: {
        cold: Number,
        freeze: Number,
        amount: {
            type: Number,
            min: 1
        },
        external: Number,
        crate: Number,
        cooler: Number
    },
    printInfo: {
        count: {
            type: Number,
            default: 0
        },
        data: [String]
    },
    labels: [{
        _id: false,
        name: String,
        label: String,
        style: {
            backgroundColor: String,
            color: String,
            iconName: String
        }
    }],
    messages: [{
        _id: false,
        phone: String,
        messageId: String,
        type: { type: String, default: 'notification', enum: ['sms', 'notification'] },
        message: String,
        date: { type: Date, default: Date.now },
        source: String,
        adminId: String
    }],
    archiveInfo: {
        userDeleteRequest: Boolean,
        userDeleteRequestDate: Date,
        restoredUser: Boolean,
        restoredAt: Date
    },
    shipperComment: String,
}

const virtuals = {
    displayComment: function () {
        const commentFirstStatus = ['paid', 'pick', 'paid-edit', 'cart']
        return this.address && this.address.comment ?
            (this.comment ?
                (commentFirstStatus.includes(this.status) ?
                    `${this.comment} ${this.address.comment}` :
                    `${this.address.comment} ${this.comment}`
                ) :
                this.address.comment)
            : this.comment
    }
}

const counterName = 'order-number-counter'
const methods = Order => ({
    getNumber: async function () {
        const nextNumber = await Counter.findOneAndUpdate(
            { name: counterName },
            { $inc: { value: 1 } },
            {
                upsert: true,
                setDefaultsOnInsert: true,
                returnDocument: 'after'
            }
        ).lean()
        return nextNumber?.value
    }
})

const defaultSelect = {
    _id: 0,
    id: 1,
    status: 1,
    sum: 1,
    websiteCart: 1,
    cart: 1,
    coupons: 1,
    orderPickupToken: 1,
    deliveryMethod: 1,
    storeId: 1,
    window: 1
}

const index = [
    { storeId: -1 },
    { userId: -1 }
]

export const meta = {
    index,
    constants,
    virtuals,
    methods,
    defaultSelect
}

export default orderSchema