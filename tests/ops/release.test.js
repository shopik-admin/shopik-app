import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import release from '../../server/api/order/ops/release.js'

function makeAdmin({ id = 'a1', permissions = [], storeIds = ['s1'], isSuperAdmin = false } = {}) {
    return {
        id,
        isSuperAdmin,
        storeIds,
        hasPermission: permission => isSuperAdmin || permissions.includes(permission)
    }
}

function makeHarness({ order, admin, updateReturns = 'doc' } = {}) {
    const calls = { orderUpdate: null, ownerUpdate: null, timeline: null }
    const DL = {
        Order: {
            readById: async () => order,
            updateOne: async (filter, update) => {
                calls.orderUpdate = { filter, update }
                if (updateReturns === 'null') return null
                return { ...order, ...update.$set }
            }
        },
        Owner: {
            updateOne: async (filter, update) => { calls.ownerUpdate = { filter, update } }
        },
        Timeline: { constants: { EVENT_TYPES: { ORDER_STATUS_UPDATE: 'ORDER_STATUS_UPDATE' } } }
    }
    const utils = {
        data: {
            timeline: {
                record: async entry => { calls.timeline = entry },
                adminActor: actor => ({ adminId: actor.id })
            }
        }
    }
    return { DL, utils, calls, admin }
}

function pickingOrder(overrides = {}) {
    return {
        id: 'o1',
        status: 'picking',
        storeId: 's1',
        picker: { adminId: 'p1', name: 'Picker One' },
        pickStart: new Date(),
        pickingReleaseCount: 2,
        cart: [{ barcode: 'b1', finalAmount: 1 }],
        ...overrides
    }
}

describe('order/ops/release', () => {
    it('lets a manager release another picker and clears the picker', async () => {
        const order = pickingOrder()
        const admin = makeAdmin({ id: 'm1', permissions: ['order:pick:manage'], storeIds: ['s1'] })
        const { DL, utils, calls } = makeHarness({ order, admin })

        const updated = await release({ id: 'o1' }, { DL, _admin: admin, utils })

        assert.equal(updated.status, 'paid')
        assert.equal(calls.orderUpdate.filter.id, 'o1')
        assert.equal(calls.orderUpdate.filter.status, 'picking')
        assert.equal(calls.orderUpdate.update.$set.picker, null)
        assert.equal(calls.orderUpdate.update.$set.status, 'paid')
        assert.equal(calls.orderUpdate.update.$set.pickStart, null)
        assert.equal(calls.orderUpdate.update.$set.pickingReleaseCount, 3)
        assert.equal(calls.orderUpdate.update.$unset.pickEnd, 1)
        // the picker's active row is closed, not the manager's
        assert.deepEqual(calls.ownerUpdate.filter, { orderId: 'o1', type: 'picking', status: 'active' })
        assert.equal(calls.timeline.changes.oldData.picker.adminId, 'p1')
        assert.equal(calls.timeline.changes.newData.picker, null)
    })

    it('lets a picker release their own order', async () => {
        const order = pickingOrder()
        const admin = makeAdmin({ id: 'p1', permissions: ['order:pick'], storeIds: ['s1'] })
        const { DL, utils } = makeHarness({ order, admin })

        const updated = await release({ id: 'o1' }, { DL, _admin: admin, utils })
        assert.equal(updated.status, 'paid')
    })

    it('rejects a picker releasing someone else’s order', async () => {
        const order = pickingOrder()
        const admin = makeAdmin({ id: 'p2', permissions: ['order:pick'], storeIds: ['s1'] })
        const { DL, utils } = makeHarness({ order, admin })

        await assert.rejects(
            release({ id: 'o1' }, { DL, _admin: admin, utils }),
            err => err.status === 403
        )
    })

    it('rejects orders that are not picking', async () => {
        const order = pickingOrder({ status: 'picked' })
        const admin = makeAdmin({ id: 'm1', permissions: ['order:pick:manage'] })
        const { DL, utils } = makeHarness({ order, admin })

        await assert.rejects(
            release({ id: 'o1' }, { DL, _admin: admin, utils }),
            err => err.status === 400
        )
    })

    it('rejects a store outside the admin scope', async () => {
        const order = pickingOrder({ storeId: 's2' })
        const admin = makeAdmin({ id: 'm1', permissions: ['order:pick:manage'], storeIds: ['s1'] })
        const { DL, utils } = makeHarness({ order, admin })

        await assert.rejects(
            release({ id: 'o1' }, { DL, _admin: admin, utils }),
            err => err.status === 403
        )
    })

    it('returns 409 when another request changed the status first', async () => {
        const order = pickingOrder()
        const admin = makeAdmin({ id: 'm1', permissions: ['order:pick:manage'] })
        const { DL, utils } = makeHarness({ order, admin, updateReturns: 'null' })

        await assert.rejects(
            release({ id: 'o1' }, { DL, _admin: admin, utils }),
            err => err.status === 409
        )
    })
})
