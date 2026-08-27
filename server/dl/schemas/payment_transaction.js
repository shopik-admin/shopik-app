const TRANSACTION_KIND = { AUTH: 'auth', CAPTURE: 'capture', REFUND: 'refund', CANCEL: 'cancel' }
const TRANSACTION_STATUS = { PENDING: 'pending', SUCCESS: 'success', FAILED: 'failed' }

const paymentTransactionSchema = {
    domainId: String,
    storeId: String,
    orderId: {
        type: String,
        filter: true
    },
    orderNumber: {
        type: String,
        filter: true
    },
    userId: {
        type: String,
        filter: true
    },
    provider: {
        type: String,
        default: 'hyp',
        filter: true
    },
    kind: {
        type: String,
        enum: Object.values(TRANSACTION_KIND),
        filter: true
    },
    status: {
        type: String,
        enum: Object.values(TRANSACTION_STATUS),
        default: 'pending',
        filter: true
    },
    amount: Number,
    // generic provider fields (no hyp prefix)
    terminalId: String,
    providerTxnId: {
        type: String,
        filter: true
    },
    parentProviderTxnId: String,
    providerCode: Number,
    authCode: String,
    providerUid: String,
    providerPayerId: String,
    signature: String,
    cardToken: String,
    cardExpiry: String,
    last4digits: {
        type: String,
        filter: true
    },
    cardCompany: String,
    items: [{
        _id: false,
        productId: String,
        barcode: String,
        name: String,
        amount: Number
    }],
    reason: String,
    providerData: Object,
    error: String
}

const index = [
    { orderId: -1 },
    { orderNumber: -1 },
    { providerTxnId: 1 },
    { provider: 1, kind: 1, status: 1 }
]

export const meta = {
    index,
    constants: { TRANSACTION_KIND, TRANSACTION_STATUS },
    noActive: true
}

export default paymentTransactionSchema
