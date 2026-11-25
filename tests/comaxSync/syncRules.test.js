import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    buildSyncFilter,
    hideActiveProduct,
    hideCategoryFlaggedProducts,
    hideInactiveProducts,
    hideKashrutMissingProducts,
    hideStorelessProducts,
    shouldEnforceBuyingPrice
} from '../../server/api/comax_product/syncRules.js'
import { KASHRUT_VALID_CODES } from '../../common/components/Kashrut/constants.js'

const STATUS = { ACTIVE: 'active', HIDDEN: 'hidden' }
const INACTIVE_FILTER = { active: false, barcode: { $nin: [null, ''] } }

describe('comax sync rules', () => {
    it('excludes explicitly inactive comax products', () => {
        assert.deepEqual(buildSyncFilter(), {
            active: { $ne: false },
            isTrailingItem: { $ne: true },
            superDepartmentCode: { $exists: true, $nin: ['12', null] },
            departmentCode: { $exists: true },
            groupCode: { $exists: true }
        })
    })

    it('hides only an active product for one barcode', async () => {
        const calls = []
        const DL = {
            Product: {
                constants: { STATUS },
                update: async (filter, update) => {
                    calls.push({ filter, update })
                    return { modifiedCount: 1 }
                }
            }
        }

        const hidden = await hideActiveProduct({ DL, barcode: '123' })

        assert.equal(hidden, 1)
        assert.deepEqual(calls, [{
            filter: { barcode: '123', status: 'active' },
            update: { status: 'hidden' }
        }])
    })

    it('does nothing without a barcode', async () => {
        const DL = {
            Product: {
                constants: { STATUS },
                update: async () => { throw new Error('should not update') }
            }
        }

        assert.equal(await hideActiveProduct({ DL }), 0)
    })

    it('hides active products for inactive comax rows in barcode pages', async () => {
        const rows = [{ barcode: '1' }, { barcode: '2' }, { barcode: '3' }]
        const updates = []
        const pages = []
        const DL = {
            ComaxProduct: {
                read: async (filter, select, options) => {
                    pages.push({ filter, select, options })
                    const after = filter.barcode?.$gt
                    return rows.filter(row => !after || row.barcode > after).slice(0, options.limit)
                }
            },
            Product: {
                constants: { STATUS },
                update: async (filter, update) => {
                    updates.push({ filter, update })
                    return { modifiedCount: filter.barcode.$in.length }
                }
            }
        }

        const hidden = await hideInactiveProducts({ DL, batchSize: 2 })

        assert.equal(hidden, 3)
        assert.deepEqual(updates, [
            {
                filter: { barcode: { $in: ['1', '2'] }, status: 'active' },
                update: { status: 'hidden' }
            },
            {
                filter: { barcode: { $in: ['3'] }, status: 'active' },
                update: { status: 'hidden' }
            }
        ])
        // Keyset pages on the unique barcode, never skip: MongoDB bounds a
        // blocking sort by skip + limit, which the whole catalog walks past.
        assert.deepEqual(pages.map(page => page.filter.barcode), [
            INACTIVE_FILTER.barcode,
            { $gt: '2' }
        ])
        assert.deepEqual(pages.map(page => page.options), [
            { limit: 2, sort: { barcode: 1 } },
            { limit: 2, sort: { barcode: 1 } }
        ])
    })

    it('stops when there are no inactive comax rows', async () => {
        const DL = {
            ComaxProduct: {
                read: async () => []
            },
            Product: {
                constants: { STATUS },
                update: async () => { throw new Error('should not update') }
            }
        }

        assert.equal(await hideInactiveProducts({ DL }), 0)
    })

    it('hides every active product that is in no store', async () => {
        const calls = []
        const DL = {
            Product: {
                constants: { STATUS },
                update: async (filter, update) => {
                    calls.push({ filter, update })
                    return { modifiedCount: 7 }
                }
            }
        }

        const hidden = await hideStorelessProducts({ DL })

        assert.equal(hidden, 7)
        assert.deepEqual(calls, [{
            filter: { status: 'active', 'storeIds.0': { $exists: false } },
            update: { status: 'hidden' }
        }])
    })

    it('counts only the products the sweep actually changed', async () => {
        const DL = {
            Product: {
                constants: { STATUS },
                update: async () => ({ modifiedCount: 0 })
            }
        }

        assert.equal(await hideStorelessProducts({ DL }), 0)
    })

    it('hides active products in hidden sub-groups or in an inactive category', async () => {
        const calls = []
        const filters = []
        const DL = {
            CategoryMap: {
                read: async (filter, select) => {
                    filters.push({ filter, select })
                    return [{ subGroupCode: '2' }]
                }
            },
            Product: {
                constants: { STATUS },
                update: async (filter, update) => {
                    calls.push({ filter, update })
                    return { modifiedCount: 3 }
                }
            }
        }

        const hidden = await hideCategoryFlaggedProducts({
            DL,
            ruleLookup: { bySubGroupCode: new Map([['1', { hidden: true }]]) }
        })

        assert.equal(hidden, 3)
        assert.deepEqual(filters, [
            { filter: { categoryActive: false }, select: { _id: 0, subGroupCode: 1 } }
        ])
        assert.deepEqual(calls, [{
            filter: { status: 'active', comaxSubGroupCode: { $in: ['2', '1'] } },
            update: { status: 'hidden' }
        }])
    })

    it('hides active products in kashrut-required sub-groups without a valid code', async () => {
        const calls = []
        const DL = {
            Product: {
                constants: { STATUS },
                update: async (filter, update) => {
                    calls.push({ filter, update })
                    return { modifiedCount: 2 }
                }
            }
        }

        const hidden = await hideKashrutMissingProducts({
            DL,
            ruleLookup: { bySubGroupCode: new Map([['90200', { requireKashrut: true }]]) }
        })

        assert.equal(hidden, 2)
        assert.deepEqual(calls, [{
            filter: {
                status: 'active',
                comaxSubGroupCode: { $in: ['90200'] },
                'kashrut.rabbinates': { $not: { $elemMatch: { code: { $in: [...KASHRUT_VALID_CODES] } } } }
            },
            update: { status: 'hidden' }
        }])
    })

    it('does not touch products when no sub-group carries the flag', async () => {
        const DL = {
            CategoryMap: { read: async () => [] },
            Product: {
                constants: { STATUS },
                update: async () => { throw new Error('should not update') }
            }
        }

        assert.equal(await hideCategoryFlaggedProducts({ DL }), 0)
        assert.equal(await hideKashrutMissingProducts({
            DL,
            ruleLookup: { bySubGroupCode: new Map() }
        }), 0)
    })

    it('checks for buying prices once for concurrent callers and retries after a failure', async () => {
        let calls = 0
        const DL = {
            ComaxProduct: {
                Model: {
                    exists: async () => {
                        calls += 1
                        return { _id: 'any' }
                    }
                }
            }
        }

        const answers = await Promise.all([
            shouldEnforceBuyingPrice(DL),
            shouldEnforceBuyingPrice(DL),
            shouldEnforceBuyingPrice(DL)
        ])
        assert.deepEqual(answers, [true, true, true])
        assert.equal(calls, 1)

        // Served from the memo afterwards.
        assert.equal(await shouldEnforceBuyingPrice(DL), true)
        assert.equal(calls, 1)

        // A failed lookup is not cached: the next call retries.
        const failing = { ComaxProduct: { Model: { exists: async () => { throw new Error('boom') } } } }
        await assert.rejects(shouldEnforceBuyingPrice(failing), /boom/)
        let retried = 0
        failing.ComaxProduct.Model.exists = async () => {
            retried += 1
            return null
        }
        assert.equal(await shouldEnforceBuyingPrice(failing), false)
        assert.equal(retried, 1)
    })
})
