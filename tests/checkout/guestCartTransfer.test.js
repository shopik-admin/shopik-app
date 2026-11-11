import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import login from '../../server/api/user/login.js'
import { GUEST_CART_TOKEN_COOKIE } from '../../common/constants.js'

const user = {
    id: 'u1',
    domainId: 'd1',
    phone: '0501234567',
    name: { first: 'Dana', last: 'Levi' },
    email: 'dana@example.com',
    deliveryMethod: 'delivery',
    addresses: [{ active: true, city: 'ירושלים', street: 'בינת יששכר', building: 2 }]
}

const guestCart = (over = {}) => ({
    id: 'gc1',
    domainId: 'd1',
    cart: [{ id: 'p1', amount: 2, price: 100, totalSum: 200 }],
    sales: {},
    sum: 200,
    sumNoCoupon: 200,
    finalSum: 200,
    finalSumNoCoupon: 200,
    coupons: [],
    ...over
})

// An existing cart order whose totals were left at 0 by a previous empty
// cart (the reported case): sum is copied over from the guest cart, the
// shipping totals must be recomputed, not left stale.
const emptyOrder = (over = {}) => ({
    id: 'o1',
    userId: 'u1',
    domainId: 'd1',
    status: 'cart',
    deliveryMethod: 'delivery',
    cart: [],
    sum: 0,
    sumNoCoupon: 0,
    finalSum: 0,
    finalSumNoCoupon: 0,
    shipping: 0,
    sumWithShipping: 0,
    finalShipping: 0,
    finalSumWithShipping: 0,
    ...over
})

function info({ order, guest, shipping }) {
    const updates = []
    return {
        updates,
        args: {
            DL: {
                Otp: {
                    readOne: async () => ({ otp: '1234', phone: user.phone }),
                    deleteOne: async () => ({})
                },
                User: {
                    readOne: async () => user,
                    create: async () => user,
                    updateOne: async () => ({ ...user, deliveryMethod: order.deliveryMethod })
                },
                GuestCart: {
                    readOne: async () => guest,
                    deleteOne: async () => ({})
                },
                Order: {
                    updateOne: async (filter, update) => {
                        updates.push(update)
                        return { ...order, ...(update?.$set || {}) }
                    }
                },
                Setting: { readOne: async () => (shipping ? { value: shipping } : null) },
                Domain: { readOne: async () => null }
            },
            utils: {
                auth: { createToken: () => 'tok' },
                data: { getUserOrder: async () => order }
            },
            platform: 'web',
            setCookie: () => {},
            clearCookie: () => {},
            cookies: { [GUEST_CART_TOKEN_COOKIE]: guest?.id ?? 'gc1' }
        }
    }
}

async function loginAndGetTransfer(options) {
    const { updates, args } = info(options)
    await login({ phone: user.phone, otpToken: 'otp1', otp: '1234' }, args)
    return updates.find(u => u?.$set?.cart)?.$set
}

describe('login guest cart transfer', () => {
    it('recomputes the shipping totals instead of keeping stale zeros', async () => {
        const transfer = await loginAndGetTransfer({
            order: emptyOrder({ sum: 498.18, finalSum: 498.18 }),
            guest: guestCart({ sum: 498.18, sumNoCoupon: 527.48, finalSum: 498.18, finalSumNoCoupon: 527.48 }),
            shipping: { total: 29.9, freeFrom: 300 }
        })
        assert.equal(transfer.sum, 498.18)
        assert.equal(transfer.shipping, 0)
        assert.equal(transfer.finalShipping, 0)
        assert.equal(transfer.sumWithShipping, 498.18)
        assert.equal(transfer.finalSumWithShipping, 498.18)
    })

    it('adds the delivery fee when the sum is below the free-shipping threshold', async () => {
        const transfer = await loginAndGetTransfer({
            order: emptyOrder({ sum: 100, finalSum: 90 }),
            guest: guestCart({ sum: 100, sumNoCoupon: 100, finalSum: 90, finalSumNoCoupon: 100 }),
            shipping: { total: 29.9, freeFrom: 300 }
        })
        assert.equal(transfer.shipping, 29.9)
        assert.equal(transfer.sumWithShipping, 129.9)
        assert.equal(transfer.finalSumWithShipping, 119.9)
    })

    it('uses the order delivery method, not the guest cart default', async () => {
        const transfer = await loginAndGetTransfer({
            order: emptyOrder({ deliveryMethod: 'pickup', sum: 100, finalSum: 100 }),
            guest: guestCart({ sum: 100, finalSum: 100 }),
            shipping: { total: 29.9, freeFrom: 300, pickupTotal: 19.9, pickupFreeFrom: 500 }
        })
        assert.equal(transfer.shipping, 19.9)
        assert.equal(transfer.sumWithShipping, 119.9)
        assert.equal(transfer.finalSumWithShipping, 119.9)
    })

    it('copies the guest cart totals when the shipping setting is missing', async () => {
        const transfer = await loginAndGetTransfer({
            order: emptyOrder(),
            guest: guestCart(),
            shipping: null
        })
        assert.equal(transfer.sum, 200)
        assert.equal(transfer.finalSum, 200)
        assert.equal(transfer.shipping, 0)
        assert.equal(transfer.sumWithShipping, 200)
        assert.equal(transfer.finalSumWithShipping, 200)
    })

    it('keeps the existing cart order untouched when it already has items', async () => {
        const transfer = await loginAndGetTransfer({
            order: emptyOrder({ cart: [{ id: 'existing', amount: 1, price: 10 }], sum: 10, finalSum: 10 }),
            guest: guestCart(),
            shipping: { total: 29.9, freeFrom: 300 }
        })
        assert.equal(transfer, undefined)
    })
})
