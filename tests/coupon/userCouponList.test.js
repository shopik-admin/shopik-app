import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import userCoupon from '../../server/api/user/coupon.js'

function coupon(overrides) {
    return {
        code: 'save10',
        name: 'Save 10',
        description: 'desc',
        discount: 10,
        benefit: 'sum',
        minSum: 0,
        dynamic: false,
        ...overrides
    }
}

function fakeDL(coupons) {
    const filters = []
    return {
        filters,
        DL: {
            Coupon: {
                constants: { STATUS: { ACTIVE: 'active' } },
                read: async filter => {
                    filters.push(filter)
                    // mimic the DB: only the public query returns public coupons
                    return coupons.filter(c => filter.public === undefined || c.public === filter.public)
                }
            }
        }
    }
}

const utils = { data: { getUserOrder: async () => ({ sumNoCoupon: 100 }) } }

describe('user/coupon list', () => {
    it('only queries active, in-window, public coupons', async () => {
        const { DL, filters } = fakeDL([])
        await userCoupon({}, { DL, _user: { id: 'u1' }, utils })

        assert.equal(filters.length, 1)
        assert.equal(filters[0].status, 'active')
        assert.equal(filters[0].public, true)
        assert.ok(filters[0].start.$lte instanceof Date)
        assert.ok(filters[0].end.$gte instanceof Date)
    })

    it('leaves non-public coupons out of the list', async () => {
        const { DL } = fakeDL([
            coupon({ code: 'visible', public: true }),
            coupon({ code: 'secret', public: false }),
            coupon({ code: 'legacy' }), // created before the flag existed
        ])

        const res = await userCoupon({}, { DL, _user: { id: 'u1' }, utils })

        assert.deepEqual(res.coupons.map(c => c.code), ['visible'])
    })

    it('still returns public coupons whose minSum is not met', async () => {
        const { DL } = fakeDL([coupon({ code: 'big', public: true, minSum: 500 })])

        const res = await userCoupon({}, { DL, _user: { id: 'u1' }, utils })

        assert.equal(res.coupons.length, 1)
        assert.equal(res.coupons[0].code, 'big')
    })
})
