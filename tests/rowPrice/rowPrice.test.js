import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getRowPriceInfo, isBundleSale, isBundleReached } from '../../common/functions/rowPrice.js'
import calcOrder from '../../common/functions/calcOrder/cart.js'

// The row price of a cart line: what the customer pays for the line, against
// what the same line costs at the regular unit price. totalSum is the money
// split the server calculated for the line.

// A cart line as the cart calc builds it: the same path the server takes
// when the customer changes an amount.
function cartLine({ amount, price = 7, sale }) {
    const product = { id: 'p1', name: 'prod', barcode: 'B1', price, saleIds: sale ? [sale.id] : [], unit: { type: 'item' } }
    const order = calcOrder({
        order: { cart: [] },
        product,
        amount,
        sales: sale ? { [sale.id]: sale } : {}
    })
    return order.cart[0]
}

const BUNDLE = {
    id: 'S1', kind: 'price', amount: 4, price: 10, barcodes: ['B1'],
    start: new Date('2020-01-01'), end: new Date('2030-01-01'), name: '4 for 10'
}

const PERCENT = {
    id: 'S2', kind: 'percent', amount: 1, percent: 15, barcodes: ['B1'],
    start: new Date('2020-01-01'), end: new Date('2030-01-01'), name: '15% off'
}

describe('cart line totals', () => {
    it('keeps a bundle line regular until the bundle size is in the cart', () => {
        const line = cartLine({ amount: 2, sale: BUNDLE })
        assert.equal(line.totalSum, 14)
        assert.equal(line.saleSum, 0)
        const row = getRowPriceInfo(line)
        assert.equal(row.hasDiscount, false)
        assert.equal(row.total, 14)
    })

    it('discounts the line once the bundle is complete', () => {
        const line = cartLine({ amount: 4, sale: BUNDLE })
        assert.equal(line.totalSum, 10)
        assert.equal(line.saleSum, 10)
        const row = getRowPriceInfo(line)
        assert.equal(row.hasDiscount, true)
        assert.equal(row.total, 10)
        assert.equal(row.regular, 28)
    })

    it('discounts a percent sale line', () => {
        const line = cartLine({ amount: 1, price: 10, sale: PERCENT })
        assert.equal(line.totalSum, 8.5)
        const row = getRowPriceInfo(line)
        assert.equal(row.hasDiscount, true)
        assert.equal(row.discount, 1.5)
    })

    it('keeps a line without a sale regular', () => {
        const line = cartLine({ amount: 3 })
        assert.equal(line.totalSum, 21)
        assert.equal(getRowPriceInfo(line).hasDiscount, false)
    })
})

describe('getRowPriceInfo', () => {
    it('falls back to price x amount for a line that was never synced', () => {
        const row = getRowPriceInfo({ price: 7, amount: 2 })
        assert.equal(row.regular, 14)
        assert.equal(row.total, 14)
        assert.equal(row.discount, 0)
        assert.equal(row.hasDiscount, false)
    })

    it('uses the server line total when the line carries a discount', () => {
        const row = getRowPriceInfo({ price: 10, amount: 1, totalSum: 8.5 })
        assert.equal(row.total, 8.5)
        assert.equal(row.regular, 10)
        assert.equal(row.discount, 1.5)
        assert.equal(row.hasDiscount, true)
    })

    it('reports no discount when the server charged the regular price', () => {
        // A "4 for 10" bundle with only 2 units in the cart is not eligible
        // yet, so the server charges the regular price for the line.
        const row = getRowPriceInfo({ price: 7, amount: 2, totalSum: 14 })
        assert.equal(row.total, 14)
        assert.equal(row.hasDiscount, false)
    })

    it('reports a discount on the bundle lines of a completed bundle', () => {
        const row = getRowPriceInfo({ price: 7, amount: 4, totalSum: 10 })
        assert.equal(row.total, 10)
        assert.equal(row.regular, 28)
        assert.equal(row.discount, 18)
        assert.equal(row.hasDiscount, true)
    })

    it('counts a partial bundle next to regular units', () => {
        // 6 units: the first 4 are the bundle (10), the other 2 are regular.
        const row = getRowPriceInfo({ price: 7, amount: 6, totalSum: 24 })
        assert.equal(row.total, 24)
        assert.equal(row.regular, 42)
        assert.equal(row.hasDiscount, true)
    })

    it('ignores a missing or broken server total', () => {
        for (const totalSum of [undefined, null, NaN, 'x']) {
            const row = getRowPriceInfo({ price: 7, amount: 2, totalSum })
            assert.equal(row.total, 14)
            assert.equal(row.hasDiscount, false)
        }
    })

    it('keeps a fractional amount', () => {
        const row = getRowPriceInfo({ price: 6.5, amount: 1.5 })
        assert.equal(row.regular, 9.75)
        assert.equal(row.total, 9.75)
    })

    it('returns null without a price', () => {
        assert.equal(getRowPriceInfo({ amount: 2 }), null)
        assert.equal(getRowPriceInfo(null), null)
    })

    it('has no line total for a catalog product (no amount)', () => {
        // A catalog product (a search result, a listing card) is not a cart
        // line: it has no amount and no line total, so the row price must
        // not be used for it.
        const row = getRowPriceInfo({ price: 5.9 })
        assert.equal(row.amount, 0)
        assert.equal(row.total, 0)
    })
})

describe('bundle threshold', () => {
    const BUNDLE = { kind: 'price', amount: 4, price: 10 }
    const PERCENT = { kind: 'percent', amount: 1, percent: 15 }
    const PER_UNIT_PRICE = { kind: 'price', amount: 1, price: 5 }

    it('recognises a multi-buy sale', () => {
        assert.equal(isBundleSale(BUNDLE), true)
        assert.equal(isBundleSale(PERCENT), false)
        assert.equal(isBundleSale(PER_UNIT_PRICE), false)
        assert.equal(isBundleSale(null), false)
    })

    it('is reached only when the bundle size is in the cart', () => {
        assert.equal(isBundleReached(BUNDLE, 2), false)
        assert.equal(isBundleReached(BUNDLE, 4), true)
        assert.equal(isBundleReached(BUNDLE, 6), true)
    })

    it('is always reached for a sale without a bundle threshold', () => {
        assert.equal(isBundleReached(PERCENT, 0), true)
        assert.equal(isBundleReached(PER_UNIT_PRICE, 0), true)
        assert.equal(isBundleReached(null, 0), true)
    })
})
