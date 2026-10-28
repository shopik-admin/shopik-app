import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildProduct } from '../../server/api/comax_product/sync.js'

const STATUS = { ACTIVE: 'active', HIDDEN: 'hidden', ARCHIVED: 'archived' }
const UNIT = { ITEM: 'item', WEIGHT: 'weight' }
const BASE_UNIT = { UNIT: 'unit', KG: 'kg' }

const DL = { Product: { constants: { STATUS, UNIT, BASE_UNIT } } }

function comaxProduct(overrides = {}) {
    return {
        barcode: '7290000000000',
        name: 'מוצר',
        price: 10,
        buyingPrice: 6,
        vat: true,
        showInWeb: true,
        superDepartmentCode: '3',
        departmentCode: '30',
        groupCode: '301',
        ...overrides
    }
}

function existingProduct(overrides = {}) {
    return {
        images: { product: [{ url: 'https://example.com/a.jpg' }] },
        prices: [],
        ...overrides
    }
}

const build = (comax = {}, existing = existingProduct(), enforceBuyingPrice = false) =>
    buildProduct(comaxProduct(comax), DL, 'default', existing, enforceBuyingPrice)

describe('comax product build', () => {
    it('hides an item that is in stock in no store', () => {
        const product = build({ storeIds: [] })

        assert.equal(product.status, STATUS.HIDDEN)
        assert.deepEqual(product.storeIds, [])
    })

    it('copies a non-empty store list next to an active status', () => {
        const product = build({ storeIds: ['store-a', 'store-b'] })

        assert.equal(product.status, STATUS.ACTIVE)
        assert.deepEqual(product.storeIds, ['store-a', 'store-b'])
    })

    it('leaves storeIds untouched when the import never tracked the item', () => {
        const product = build()

        assert.equal(product.status, STATUS.ACTIVE)
        assert.equal('storeIds' in product, false)
    })

    it('keeps an archived item archived even when it is in stock', () => {
        assert.equal(build({ archived: true, storeIds: ['store-a'] }).status, STATUS.ARCHIVED)
    })

    it('archives an item without a sale price even when it is in stock', () => {
        assert.equal(build({ price: 0, storeIds: ['store-a'] }).status, STATUS.ARCHIVED)
    })

    it('archives an item without a buying price when buying prices are enforced', () => {
        const product = build({ buyingPrice: 0, storeIds: ['store-a'] }, existingProduct(), true)

        assert.equal(product.status, STATUS.ARCHIVED)
    })

    it('hides an item with an image and stock but showInWeb off', () => {
        assert.equal(build({ showInWeb: false, storeIds: ['store-a'] }).status, STATUS.HIDDEN)
    })

    it('hides an item that has no image even when it is in stock', () => {
        const product = build({ storeIds: ['store-a'] }, existingProduct({ images: { product: [] } }))

        assert.equal(product.status, STATUS.HIDDEN)
    })
})
