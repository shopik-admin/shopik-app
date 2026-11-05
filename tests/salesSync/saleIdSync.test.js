import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { syncProductSaleIds } from '../../server/api/sale/sync.js'

const START = new Date('2026-05-01T00:00:00Z')

function makeSale(over = {}) {
    return {
        id: 'sale',
        start: START,
        end: new Date('2026-06-01T00:00:00Z'),
        kind: 'price',
        price: 10,
        amount: 1,
        barcodes: ['111'],
        ...over
    }
}

function makeDL({ sales, products = [], modifiedCount = 1 }) {
    const calls = { ops: [], productFilter: null, productSelect: null }
    const DL = {
        Sale: {
            constants: { STATUS: { ACTIVE: 'active' } },
            read: async () => sales
        },
        Product: {
            read: async (filter, select) => {
                calls.productFilter = filter
                calls.productSelect = select
                return products
            },
            Model: {
                bulkWrite: async ops => {
                    calls.ops.push(...ops)
                    return { modifiedCount }
                },
                distinct: async () => []
            }
        }
    }
    return { DL, calls }
}

function winningSaleIds(calls) {
    return Object.fromEntries(calls.ops.map(op => [
        op.updateMany.update.$set.saleIds[0],
        op.updateMany.filter.barcode.$in
    ]))
}

describe('product sale id sync', () => {
    it('uses updateMany so every barcode in one sale gets the sale id', async () => {
        const calls = { ops: null }
        const DL = {
            Sale: {
                constants: { STATUS: { ACTIVE: 'active' } },
                read: async () => [{
                    id: 'sale-1',
                    start: new Date('2026-01-01'),
                    barcodes: ['111', '222', '333']
                }]
            },
            Product: {
                Model: {
                    bulkWrite: async ops => {
                        calls.ops = ops
                        return { modifiedCount: 3 }
                    },
                    distinct: async () => []
                }
            }
        }

        const result = await syncProductSaleIds({ DL })

        assert.equal(calls.ops.length, 1)
        assert.deepEqual(calls.ops[0].updateMany, {
            filter: { barcode: { $in: ['111', '222', '333'] } },
            update: { $set: { saleIds: ['sale-1'] } }
        })
        assert.equal(result.updatedProducts, 3)
    })

    it('keeps the newest sale when a barcode is in several active sales', async () => {
        const calls = { ops: [] }
        const DL = {
            Sale: {
                constants: { STATUS: { ACTIVE: 'active' } },
                read: async () => [
                    { id: 'new', start: new Date('2026-05-01'), barcodes: ['111'] },
                    { id: 'old', start: new Date('2026-01-01'), barcodes: ['111', '222'] }
                ]
            },
            Product: {
                Model: {
                    bulkWrite: async ops => {
                        calls.ops.push(...ops)
                        return { modifiedCount: 2 }
                    },
                    distinct: async () => []
                }
            }
        }

        await syncProductSaleIds({ DL })

        const bySale = Object.fromEntries(calls.ops.map(op => [
            op.updateMany.update.$set.saleIds[0],
            op.updateMany.filter.barcode.$in
        ]))
        assert.deepEqual(bySale, { new: ['111'], old: ['222'] })
    })

    it('picks the cheaper sale when two sales start at the same time', async () => {
        const expensive = makeSale({ id: 'expensive', price: 20, amount: 2 })
        const cheap = makeSale({ id: 'cheap', price: 18, amount: 2 })

        // Order must not matter: equal starts used to leave the winner to the DB.
        for (const sales of [[expensive, cheap], [cheap, expensive]]) {
            const { DL, calls } = makeDL({ sales })
            await syncProductSaleIds({ DL })
            assert.deepEqual(winningSaleIds(calls), { cheap: ['111'] })
        }
    })

    it('compares the per-unit price, not the raw total', async () => {
        // 3 for 20 = 6.67/unit, 4 for 26 = 6.50/unit.
        const small = makeSale({ id: 'three-for-20', price: 20, amount: 3 })
        const bulk = makeSale({ id: 'four-for-26', price: 26, amount: 4 })

        for (const sales of [[small, bulk], [bulk, small]]) {
            const { DL, calls } = makeDL({ sales })
            await syncProductSaleIds({ DL })
            assert.deepEqual(winningSaleIds(calls), { 'four-for-26': ['111'] })
        }
    })

    it('prefers the bigger discount when two percent sales tie on start', async () => {
        const twenty = makeSale({ id: 'twenty', kind: 'percent', percent: 20, price: undefined })
        const thirty = makeSale({ id: 'thirty', kind: 'percent', percent: 30, price: undefined })
        const products = [{ barcode: '111', prices: [{ domainId: 'd1', price: 10 }] }]

        const { DL, calls } = makeDL({ sales: [twenty, thirty], products })
        await syncProductSaleIds({ DL })

        assert.deepEqual(winningSaleIds(calls), { thirty: ['111'] })
        // Only tied barcodes need regular prices.
        assert.deepEqual(calls.productFilter, { barcode: { $in: ['111'] } })
    })

    it('compares a percent sale against a price sale using the regular price', async () => {
        // 30% off 10 = 7.00/unit, 2 for 16 = 8.00/unit.
        const percent = makeSale({ id: 'percent', kind: 'percent', percent: 30, price: undefined })
        const price = makeSale({ id: 'price', price: 16, amount: 2 })
        const products = [{ barcode: '111', prices: [{ domainId: 'd1', price: 10 }] }]

        const { DL, calls } = makeDL({ sales: [price, percent], products })
        await syncProductSaleIds({ DL })

        assert.deepEqual(winningSaleIds(calls), { percent: ['111'] })
    })

    it('breaks a full price tie deterministically (later end, then id)', async () => {
        const short = makeSale({ id: 'short', end: new Date('2026-06-01T00:00:00Z') })
        const long = makeSale({ id: 'long', end: new Date('2026-07-01T00:00:00Z') })

        for (const sales of [[short, long], [long, short]]) {
            const { DL, calls } = makeDL({ sales })
            await syncProductSaleIds({ DL })
            assert.deepEqual(winningSaleIds(calls), { long: ['111'] })
        }

        const a = makeSale({ id: 'aaa' })
        const b = makeSale({ id: 'bbb' })
        const { DL, calls } = makeDL({ sales: [a, b] })
        await syncProductSaleIds({ DL })
        assert.deepEqual(winningSaleIds(calls), { bbb: ['111'] })
    })

    it('does not fetch regular prices when no sale starts tie', async () => {
        const older = makeSale({ id: 'older', start: new Date('2026-04-01T00:00:00Z'), price: 1 })
        const newer = makeSale({ id: 'newer', start: new Date('2026-05-01T00:00:00Z'), price: 99 })

        const { DL, calls } = makeDL({ sales: [older, newer] })
        await syncProductSaleIds({ DL })

        assert.equal(calls.productFilter, null)
        assert.deepEqual(winningSaleIds(calls), { newer: ['111'] })
    })
})
