import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import createPayment from '../../server/api/payment/create.js'
import { checkoutDisplayTotal } from '../../common/functions/cartTotals.js'

const ORDER_STATUS = { CART: 'cart', PAID: 'paid' }
const DELIVERY_METHOD = { DELIVERY: 'delivery', PICKUP: 'pickup' }

const cartOrder = (over = {}) => ({
    id: 'o1',
    number: 100019,
    userId: 'u1',
    status: 'cart',
    deliveryMethod: 'delivery',
    name: { first: 'Dana', last: 'Levi' },
    email: 'dana@example.com',
    phone: '0501234567',
    address: {
        city: 'ירושלים',
        street: 'הרב רבין',
        building: '36',
        location: { type: 'Point', coordinates: [34.78, 31.79] }
    },
    storeId: 'store1',
    window: { id: 'w1', date: '2030-01-01' },
    sum: 364.64,
    sumWithShipping: 399.54,
    finalSum: 364.64,
    finalSumWithShipping: 399.54,
    ...over
})

function info(order, calls = {}) {
    return {
        DL: {
            Order: {
                constants: { ORDER_STATUS, DELIVERY_METHOD },
                readOne: async () => order,
                updateOne: async (filter, update) => ({ ...order, ...(update?.$set || {}), ...(update || {}) })
            },
            Setting: { readOne: async () => null },
            SupplyArea: { readOne: async () => ({ id: 'area1' }) },
            PaymentTransaction: {
                constants: {
                    TRANSACTION_KIND: { AUTH: 'auth', CAPTURE: 'capture' },
                    TRANSACTION_STATUS: { PENDING: 'pending', SUCCESS: 'success' }
                },
                create: async () => ({ id: 'txn1' })
            },
            Timeline: { constants: { EVENT_TYPES: { PAYMENT: 'payment' } } }
        },
        _user: { id: 'u1', name: order.name, email: order.email, phone: order.phone },
        utils: {
            data: {
                getStoreForAddress: async () => 'store1',
                timeline: { record: async () => ({}), userActor: () => ({ type: 'user' }) }
            }
        },
        external: {
            hyp: {
                createPaymentUrl: async ({ amount }) => {
                    calls.amount = amount
                    return 'https://pay.example/1'
                }
            }
        }
    }
}

describe('payment/create total guard', () => {
    it('refuses to authorize a cart that changed after the total was displayed', async () => {
        // The reported case: the cart showed ₪386.64 but the server order was
        // ₪399.54 (one ₪12.90 product out of sync) — must not be charged.
        const order = cartOrder({ sum: 351.74, sumWithShipping: 386.64, finalSum: 351.74, finalSumWithShipping: 399.54 })
        const calls = {}
        await assert.rejects(
            () => createPayment({ orderId: 'o1', expectedAmount: 386.64 }, info(order, calls)),
            (err) => {
                assert.equal(err.code, 'CART_CHANGED')
                assert.equal(err.status, 409)
                assert.equal(err.amount, 399.54)
                assert.equal(err.expectedAmount, 386.64)
                return true
            }
        )
        assert.equal(calls.amount, undefined, 'no payment url may be created for a higher total')
    })

    it('authorizes the displayed total when the cart matches', async () => {
        const order = cartOrder({ sum: 351.74, sumWithShipping: 386.64, finalSum: 351.74, finalSumWithShipping: 386.64 })
        const calls = {}
        const res = await createPayment({ orderId: 'o1', expectedAmount: 386.64 }, info(order, calls))
        assert.equal(res.paymentUrl, 'https://pay.example/1')
        assert.equal(calls.amount, 386.64)
    })

    it('treats a missing expectedAmount as "no client total" (legacy clients)', async () => {
        const order = cartOrder({ sum: 351.74, sumWithShipping: 386.64, finalSum: 351.74, finalSumWithShipping: 386.64 })
        const calls = {}
        const res = await createPayment({ orderId: 'o1' }, info(order, calls))
        assert.equal(res.paymentUrl, 'https://pay.example/1')
        assert.equal(calls.amount, 386.64)
    })
})

describe('checkoutDisplayTotal', () => {
    it('uses the pre-coupon total with shipping when no coupon applies', () => {
        assert.equal(checkoutDisplayTotal(cartOrder({ sumWithShipping: 386.64, finalSumWithShipping: 399.54 })), 386.64)
    })

    it('uses the coupon-discounted total when a coupon is applied', () => {
        const order = cartOrder({
            sumWithShipping: 399.54,
            finalSumWithShipping: 386.64,
            coupons: [{ code: 'SAVE12', isActive: true }]
        })
        assert.equal(checkoutDisplayTotal(order), 386.64)
    })

    it('falls back to sum + shipping for a cart with no stored total', () => {
        assert.equal(checkoutDisplayTotal({ sum: 351.74, shipping: 34.9 }), 386.64)
    })
})
