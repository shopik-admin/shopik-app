import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyStockFilter } from '../../server/utils/data/withStock.js'

// Stock is a per-store filter: the catalog is already trimmed by the nightly
// sync (a product in stock nowhere is HIDDEN), so a request without a resolved
// store must not add a stock condition of its own.
describe('store stock filter', () => {
    it('filters by the resolved store', () => {
        assert.deepEqual(applyStockFilter({ status: 'active' }, 'store-a', 'filter'), {
            status: 'active',
            storeIds: 'store-a'
        })
    })

    it('adds no stock condition when no store is resolved', () => {
        assert.deepEqual(applyStockFilter({ status: 'active' }, null, 'filter'), { status: 'active' })
    })

    it('leaves the filter alone outside filter mode', () => {
        assert.deepEqual(applyStockFilter({ status: 'active' }, 'store-a', 'annotate'), { status: 'active' })
        assert.deepEqual(applyStockFilter({ status: 'active' }, 'store-a', 'off'), { status: 'active' })
    })
})
