import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import syncComaxSales from '../../server/api/comax_sale/sync.js'
import { findInflatedBarcode } from '../../server/utils/data/validateSalePrice.js'

const STATUS = { ACTIVE: 'active', PENDING: 'pending', DONE: 'done', CANCELED: 'canceled' }
const KINDS = { PRICE: 'price', PERCENT: 'percent', RECEIVE_AMOUNT: 'receive-amount', RECEIVE_PRICE: 'receive-price' }
const TYPES = { PRODUCT: 'product', CART: 'cart' }

function comaxSale(over = {}) {
    return {
        comaxId: 's1',
        name: 'sale',
        promotionType: 1,
        quantity: 1,
        total: 9,
        fromDate: new Date('2020-01-01'),
        toDate: new Date('2030-01-01'),
        swActive: true,
        items: [{ Kod: '111', SwNotActive: false }],
        itemsModel: [],
        ...over
    }
}

function makeDL({ sales = [comaxSale()], products = [], comaxRows = [], updateResult = { modifiedCount: 1 } } = {}) {
    const calls = { saleDocs: null, saleUpdates: [], productFilters: [] }
    const DL = {
        ComaxSale: {
            read: async () => sales,
            update: async () => ({})
        },
        Product: {
            constants: { STATUS: { ACTIVE: 'active' } },
            // Emulate the mongo filter: the old code asked only for active
            // products, so a hidden variant's price never reached the guard.
            read: async (filter = {}) => {
                calls.productFilters.push(filter)
                return filter.status ? products.filter(p => p.status === filter.status) : products
            },
            bulkWrite: async () => ({ modifiedCount: 0 }),
            update: async () => ({ modifiedCount: 0 }),
            Model: { distinct: async () => [] }
        },
        ComaxProduct: {
            read: async () => comaxRows
        },
        Sale: {
            constants: { STATUS, KINDS, TYPES },
            read: async () => [],
            update: async (filter, update) => {
                calls.saleUpdates.push({ filter, update })
                return updateResult
            },
            bulkWrite: async ({ docs }) => {
                calls.saleDocs = docs
                return { upsertedCount: docs.length, modifiedCount: 0 }
            }
        }
    }
    return { DL, calls }
}

const ACTIVE_SALMON = [{ barcode: '111', status: 'active', prices: [{ domainId: 'd1', price: 69.9 }] }]

function canceledCall(calls) {
    return calls.saleUpdates.find(call => call.filter.createdBy === 'Comax Sync')
}

describe('comax sale price guards', () => {
    it('rejects a fractional price amount and cancels an already-synced doc', async () => {
        const { DL, calls } = makeDL({
            sales: [comaxSale({ quantity: 0.01, total: 49.9 })],
            products: ACTIVE_SALMON,
            comaxRows: [{ barcode: '111', comaxId: '111' }]
        })

        const result = await syncComaxSales({}, { DL })

        // No sale may be written: `amount: 0.01` is applied as price/amount
        // (₪4,990/kg) and repeated for every 0.01 of the cart line.
        assert.equal(calls.saleDocs, null)
        assert.equal(result.skippedFractional, 1)
        assert.equal(result.canceled, 1)

        const cancel = canceledCall(calls)
        assert.deepEqual(cancel.filter.id, { $in: ['s1'] })
        assert.deepEqual(cancel.update, { status: 'canceled' })
    })

    it('sees the price of a hidden variant and blocks an inflated model sale', async () => {
        const { DL, calls } = makeDL({
            sales: [comaxSale({
                items: [],
                itemsModel: [{ Kod: 'm1', SwNotActive: false }],
                quantity: 3,
                total: 20
            })],
            products: [{ barcode: '444', status: 'hidden', prices: [{ domainId: 'd1', price: 5 }] }],
            comaxRows: [{ barcode: '444', comaxId: '444', models: [{ id: 'm1' }], trailingPrice: 0 }]
        })

        const result = await syncComaxSales({}, { DL })

        // ₪20 for 3 units is not a discount against ₪5 × 3 = ₪15.
        assert.equal(calls.saleDocs, null)
        assert.equal(result.skippedInflated, 1)
    })

    it('keeps a model sale that is a real discount even when its variants are hidden', async () => {
        const { DL, calls } = makeDL({
            sales: [comaxSale({
                items: [],
                itemsModel: [{ Kod: 'm1', SwNotActive: false }],
                quantity: 3,
                total: 12
            })],
            products: [{ barcode: '444', status: 'hidden', prices: [{ domainId: 'd1', price: 5 }] }],
            comaxRows: [{ barcode: '444', comaxId: '444', models: [{ id: 'm1' }], trailingPrice: 0 }]
        })

        const result = await syncComaxSales({}, { DL })

        assert.deepEqual(calls.saleDocs[0].barcodes, ['444'])
        assert.equal(calls.saleDocs[0].amount, 3)
        assert.equal(calls.saleDocs[0].price, 12)
        assert.equal(result.canceled, 0)
    })

    it('fails closed when no barcode in the sale has a known price', async () => {
        const { DL, calls } = makeDL({
            sales: [comaxSale({
                items: [],
                itemsModel: [{ Kod: 'm1', SwNotActive: false }]
            })],
            products: [],
            comaxRows: [{ barcode: '444', comaxId: '444', models: [{ id: 'm1' }] }]
        })

        const result = await syncComaxSales({}, { DL })

        // Nothing proves this is a discount, so it must not go live.
        assert.equal(calls.saleDocs, null)
        assert.equal(result.skippedInflated, 1)
    })

    it('keeps a whole-unit sale that is a real discount', async () => {
        const { DL, calls } = makeDL({
            sales: [comaxSale({ quantity: 1, total: 49.9 })],
            products: ACTIVE_SALMON,
            comaxRows: [{ barcode: '111', comaxId: '111' }]
        })

        const result = await syncComaxSales({}, { DL })

        assert.equal(calls.saleDocs[0].amount, 1)
        assert.equal(calls.saleDocs[0].price, 49.9)
        assert.equal(canceledCall(calls), undefined)
        assert.equal(result.skippedFractional, 0)
    })
})

describe('findInflatedBarcode fail-closed rule', () => {
    const sale = (price, barcodes) => ({ kind: 'price', price, amount: 1, barcodes })

    it('skips a sale when no barcode can be priced', () => {
        assert.equal(findInflatedBarcode(sale(10, ['unknown']), new Map()), 'unknown')
        assert.equal(findInflatedBarcode(sale(10, ['unpriced']), new Map([['unpriced', undefined]])), 'unpriced')
    })

    it('tolerates an unknown barcode while a known one proves the discount', () => {
        const prices = new Map([['known', 20]])
        assert.equal(findInflatedBarcode(sale(10, ['known', 'unknown']), prices), null)
    })

    it('still flags an inflated known price', () => {
        assert.equal(findInflatedBarcode(sale(25, ['known']), new Map([['known', 20]])), 'known')
    })
})
