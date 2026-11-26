import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getSaleLimitUnits, isSaleLimitExceeded } from '../../common/functions/salePrice.js'
import { makeProduct, makeSale, salesMap, calc, splitByProduct } from '../calcOrder/helpers.js'

// The label is built from the same numbers the money engine uses: Comax's
// maxQty is in base units, but the sale is applied once per `amount`, so a
// "3 for ₪10" with maxQty 5 discounts only 3 units.
const sale = (over = {}) => makeSale({ id: 'S1', kind: 'price', amount: 1, price: 10, limit: undefined, ...over })

describe('sale limit units', () => {
    it('has no cap when the sale is unlimited', () => {
        assert.equal(getSaleLimitUnits(sale()), 0)
        assert.equal(getSaleLimitUnits(sale({ limit: 0 })), 0)
        assert.equal(getSaleLimitUnits(null), 0)
        assert.equal(isSaleLimitExceeded(sale(), 99), false)
    })

    it('counts one unit per unit for a plain price sale', () => {
        assert.equal(getSaleLimitUnits(sale({ limit: 2 })), 2)
    })

    it('rounds a bundle limit down to whole bundles', () => {
        assert.equal(getSaleLimitUnits(sale({ amount: 3, limit: 5 })), 3)
        assert.equal(getSaleLimitUnits(sale({ amount: 2, limit: 5 })), 4)
        assert.equal(getSaleLimitUnits(sale({ amount: 2, limit: 4 })), 4)
    })

    it('keeps fractional weight limits', () => {
        assert.equal(getSaleLimitUnits(sale({ amount: 0.5, limit: 2 })), 2)
        assert.equal(getSaleLimitUnits(sale({ amount: 1, limit: 2.5 })), 2)
    })

    it('falls back to a single unit for a missing amount', () => {
        assert.equal(getSaleLimitUnits(sale({ amount: undefined, limit: 3 })), 3)
        assert.equal(getSaleLimitUnits(sale({ amount: 0, limit: 3 })), 3)
    })
})

describe('sale limit warning', () => {
    it('stays quiet at and below the cap', () => {
        const s = sale({ limit: 2 })
        assert.equal(isSaleLimitExceeded(s, 0), false)
        assert.equal(isSaleLimitExceeded(s, 1), false)
        assert.equal(isSaleLimitExceeded(s, 2), false)
    })

    it('warns only on the click that goes past the cap', () => {
        const s = sale({ limit: 2 })
        assert.equal(isSaleLimitExceeded(s, 2.001), true)
        assert.equal(isSaleLimitExceeded(s, 3), true)
    })

    it('uses the bundle cap, not the raw limit', () => {
        const s = sale({ amount: 2, limit: 5 })
        assert.equal(isSaleLimitExceeded(s, 4), false)
        assert.equal(isSaleLimitExceeded(s, 5), true)
    })
})

describe('sale limit matches the charged price', () => {
    it('labels exactly the units the engine discounts', () => {
        const p = makeProduct({ id: 'p1', barcode: 'B1', price: 15, amount: 4 })
        const s = sale({ limit: 2 })
        const r = calc([p], salesMap(s))

        assert.equal(getSaleLimitUnits(s), 2)
        assert.deepEqual(splitByProduct(r), { p1: { sale: 20, regular: 30 } })
    })
})
