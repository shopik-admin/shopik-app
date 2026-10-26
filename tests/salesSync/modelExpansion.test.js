import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import syncComaxSales from '../../server/api/comax_sale/sync.js'

const STATUS = { ACTIVE: 'active', PENDING: 'pending', DONE: 'done', CANCELED: 'canceled' }
const KINDS = { PRICE: 'price', PERCENT: 'percent', RECEIVE_AMOUNT: 'receive-amount', RECEIVE_PRICE: 'receive-price' }
const TYPES = { PRODUCT: 'product', CART: 'cart' }

function comaxSale(over = {}) {
    return {
        comaxId: 's1',
        name: 'model sale',
        promotionType: 1,
        quantity: 3,
        total: 12,
        fromDate: new Date('2020-01-01'),
        toDate: new Date('2030-01-01'),
        swActive: true,
        items: [],
        itemsModel: [{ Kod: 'm1', SwNotActive: false }],
        ...over
    }
}

function makeDL({ sale = comaxSale(), active = [], modelProducts = [] } = {}) {
    const calls = { saleSelect: null, productFilter: null, productSelect: null, saleDocs: null }
    const DL = {
        ComaxSale: {
            read: async (filter, select) => {
                calls.saleSelect = select
                return [sale]
            },
            update: async () => ({})
        },
        Product: {
            constants: { STATUS: { ACTIVE: 'active' } },
            read: async () => active,
            bulkWrite: async () => ({ modifiedCount: 0 }),
            update: async () => ({ modifiedCount: 0 }),
            Model: { distinct: async () => [] }
        },
        ComaxProduct: {
            read: async (filter, select) => {
                calls.productFilter = filter
                calls.productSelect = select
                return modelProducts
            }
        },
        Sale: {
            constants: { STATUS, KINDS, TYPES },
            read: async () => [],
            update: async () => ({ modifiedCount: 0 }),
            bulkWrite: async ({ docs }) => {
                calls.saleDocs = docs
                return { upsertedCount: 0, modifiedCount: 1 }
            }
        }
    }
    return { DL, calls }
}

function activeProduct(barcode, price = 5) {
    return { barcode, prices: [{ domainId: 'd1', price }] }
}

describe('comax sale model expansion', () => {
    it('adds every comax_products row of an itemsModel reference, regardless of status', async () => {
        const { DL, calls } = makeDL({
            active: [activeProduct('111'), activeProduct('222'), activeProduct('333')],
            modelProducts: [
                { barcode: '111', comaxId: '111', models: [{ id: 'm1' }], trailingPrice: 0 },
                { barcode: '222', comaxId: '222', models: [{ id: 'm1' }], trailingPrice: 0 },
                // Not an active Shopik product, but the model row must still be
                // in the sale so it works once the product is activated.
                { barcode: '444', comaxId: '444', models: [{ id: 'm1' }], trailingPrice: 0 }
            ]
        })

        await syncComaxSales({}, { DL })

        // The select must actually load itemsModel, otherwise the expansion is
        // invisible to the sync.
        assert.equal(calls.saleSelect.itemsModel, 1)
        assert.ok(calls.productFilter.$or.some(clause => clause['models.id']))
        assert.deepEqual(calls.saleDocs[0].barcodes, ['111', '222', '444'])
    })

    it('keeps the explicitly listed item barcodes alongside the model barcodes', async () => {
        const { DL, calls } = makeDL({
            sale: comaxSale({
                items: [{ Kod: '999', SwNotActive: false }],
                itemsModel: [{ Kod: 'm1', SwNotActive: false }]
            }),
            active: [activeProduct('111'), activeProduct('999')],
            modelProducts: [
                { barcode: '111', comaxId: '111', models: [{ id: 'm1' }] }
            ]
        })

        await syncComaxSales({}, { DL })

        assert.deepEqual(calls.saleDocs[0].barcodes.sort(), ['111', '999'])
    })

    it('keeps the deposit from the active variants when an inactive model row has none', async () => {
        const { DL, calls } = makeDL({
            sale: comaxSale({ total: 9.1, quantity: 3 }),
            active: [activeProduct('111', 4.2)],
            modelProducts: [
                { barcode: '111', comaxId: '111', models: [{ id: 'm1' }], trailingPrice: 0.3 },
                // Inactive variant without deposit data: still in the sale, but
                // it must not zero out today's bundle price.
                { barcode: '444', comaxId: '444', models: [{ id: 'm1' }], trailingPrice: 0 }
            ]
        })

        await syncComaxSales({}, { DL })

        assert.deepEqual(calls.saleDocs[0].barcodes.sort(), ['111', '444'])
        assert.equal(calls.saleDocs[0].comaxPrice, 9.1)
        assert.equal(calls.saleDocs[0].trailingTotal, 0.9)
        assert.equal(calls.saleDocs[0].price, 10)
    })
})
