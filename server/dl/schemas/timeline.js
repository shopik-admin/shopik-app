const EVENT_TYPES = {
    ORDER_CREATED: 'order_created',
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

const timelineSchema = {
    orderId: {
        type: String,
        filter: true
    },
    actor: {
        role: {
            type: String,
            enum: ['admin', 'user']
        },
        name: String,
        id: String
    },
    event: {
        type: {
            type: String,
            enum: Object.values(EVENT_TYPES),
            filter: true
        },
        category: String
    },
    outcome: {
        success: Boolean,
        errorMessage: String
    },
    changes: {
        oldData: {},
        newData: {}
    },
    context: {},
    metadata: {
        source: String,
        platform: String,
        referenceOrderNumber: Number
    }
}

const index = [
    { orderId: 1, createdAt: -1 }
]

export const meta = {
    index,
    constants: { EVENT_TYPES },
    noActive: true
}

export default timelineSchema
