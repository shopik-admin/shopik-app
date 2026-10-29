import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCartProduct } from '../../common/functions/calcOrder/cart.js'
import productSchema, { meta as productMeta } from '../../server/dl/schemas/product.js'

const product = (over = {}) => ({
    id: 'p1',
    name: 'Milk',
    barcode: '123',
    price: 10,
    unit: { type: 'item', options: [] },
    ...over
})

describe('cart VAT snapshot', () => {
    it('copies the Comax classification onto the cart line', () => {
        assert.equal(buildCartProduct({ product: product({ vat: false }), amount: 1 }).vat, false)
        assert.equal(buildCartProduct({ product: product({ vat: true }), amount: 1 }).vat, true)
    })

    it('treats a legacy product without the field as taxable', () => {
        assert.equal(buildCartProduct({ product: product(), amount: 1 }).vat, true)
    })
})

describe('product schema VAT field', () => {
    it('defaults to taxable and is filterable', () => {
        const path = productSchema.vat
        assert.equal(path.default, true)
        assert.equal(path.filter, true)
    })

    it('is part of the default select used by the storefront', () => {
        assert.equal(productMeta.defaultSelect.vat, 1)
    })
})
