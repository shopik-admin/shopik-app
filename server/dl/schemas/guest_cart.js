import { cartSchema } from './order.js'

const couponEntrySchema = {
    code: String,
    discount: Number,
    percent: Boolean,
    minSum: Number,
    maxSum: Number,
    couponMessages: Object,
    checkOnPay: Boolean
}

const guestCartSchema = {
    domainId: {
        type: String,
        default: 'default'
    },
    cart: cartSchema,
    sales: Object,
    sum: Number,
    sumNoCoupon: Number,
    finalSum: Number,
    finalSumNoCoupon: Number,
    coupons: [couponEntrySchema],
    deliveryMethod: String,
    storeId: String,
    window: Object
}

const defaultSelect = {
    _id: 0,
    id: 1,
    domainId: 1,
    sum: 1,
    cart: 1,
    coupons: 1,
    deliveryMethod: 1,
    storeId: 1,
    window: 1
}

const index = [
    [{ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }]
]

export const meta = {
    index,
    defaultSelect
}

export default guestCartSchema