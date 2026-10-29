import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    capRefundProducts,
    productRefundRemaining,
    validateRefundRequest,
} from '../../common/functions/refundCalc.js'

function makeOrder(over = {}) {
    return {
        finalSum: 100,
        finalShipping: 20,
        finalSumWithShipping: 120,
        refundedTotal: 0,
        refundedShipping: 0,
        cart: [{
            id: 'p1',
            barcode: 'b1',
            name: 'A',
            totalSum: 100,
            amount: 1,
            finalAmount: 1,
            refundedAmount: 0,
        }],
        ...over,
    }
}

describe('general refund availability', () => {
    it('starts with the full product sum (shipping excluded)', () => {
        assert.equal(productRefundRemaining(makeOrder()), 100)
    })

    it('is not reduced by a shipping-only refund', () => {
        const order = makeOrder({ refundedTotal: 20, refundedShipping: 20 })
        assert.equal(productRefundRemaining(order), 100)
    })

    it('is reduced by a previous general refund', () => {
        const order = makeOrder({ refundedTotal: 30 })
        assert.equal(productRefundRemaining(order), 70)
    })

    it('caps a later product refund to the general-refund remainder', () => {
        const order = makeOrder({ refundedTotal: 30 })
        const capped = capRefundProducts(order, [{ productId: 'p1', amount: 100 }], 0)
        assert.deepEqual(capped.items, [{ productId: 'p1', amount: 70 }])
    })

    it('caps multiple product lines in order', () => {
        const order = makeOrder({ refundedTotal: 50 })
        const capped = capRefundProducts(order, [
            { productId: 'p1', amount: 40 },
            { productId: 'p2', amount: 40 },
        ], 0)
        assert.deepEqual(capped.items, [
            { productId: 'p1', amount: 40 },
            { productId: 'p2', amount: 10 },
        ])
    })

    it('gives the general amount only what the products left over', () => {
        const order = makeOrder({ refundedTotal: 30 })
        const capped = capRefundProducts(order, [{ productId: 'p1', amount: 50 }], 30)
        assert.deepEqual(capped.items, [{ productId: 'p1', amount: 50 }])
        assert.equal(capped.generalAmount, 20)
    })

    it('validates a general-only refund up to the product remainder', () => {
        const order = makeOrder({ refundedTotal: 30 })
        const ok = validateRefundRequest(order, [], 0, 70)
        assert.deepEqual(ok.errors, [])
        assert.equal(ok.totalRefund, 70)

        const bad = validateRefundRequest(order, [], 0, 80)
        assert.ok(bad.errors.length > 0)
    })

    it('allows shipping and general to reach the full charged remainder', () => {
        const order = makeOrder()
        const result = validateRefundRequest(order, [], 20, 100)
        assert.deepEqual(result.errors, [])
        assert.equal(result.totalRefund, 120)
    })
})
