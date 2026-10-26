import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { syncProductSaleIds } from '../../server/api/sale/sync.js'

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
})
