import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import deliver, { maySkipPhoto } from '../../server/api/shipment/deliver.js'

function makeAdmin({ id = 'sh1', permissions = [], isSuperAdmin = false } = {}) {
    return {
        id,
        isSuperAdmin,
        hasPermission: permission => isSuperAdmin || permissions.includes(permission)
    }
}

// No coordinates and no shipmentId: the harness only has to answer the calls the
// proof rule is about, so the proximity and shipment branches stay out of the way.
function makeHarness(order) {
    const calls = { orderUpdate: null }
    const DL = {
        Order: {
            readById: async () => order,
            Model: {
                updateOne: async (filter, update) => {
                    calls.orderUpdate = { filter, update }
                    return order
                }
            }
        },
        Owner: { updateOne: async () => { } },
        Timeline: { constants: { EVENT_TYPES: { ORDER_STATUS_UPDATE: 'ORDER_STATUS_UPDATE' } } }
    }
    const utils = {
        data: {
            orderSms: { sendOrderStageSms: async () => { } },
            timeline: { record: async () => { }, adminActor: actor => ({ adminId: actor.id }) }
        }
    }
    return { DL, utils, calls }
}

const shippedOrder = {
    id: 'o1',
    status: 'shipped',
    storeId: 's1',
    shipper: { adminId: 'sh1' },
    address: { location: { coordinates: [34.78, 32.08] } }
}

// A 1x1 png — enough for the image branch to run without a real camera capture.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('shipment/deliver delivery proof', () => {
    it('requires a photo from a regular shipper', async () => {
        const admin = makeAdmin({ permissions: ['order:ship'] })
        const { DL, utils } = makeHarness(shippedOrder)

        await assert.rejects(
            deliver({ orderId: 'o1' }, { DL, _admin: admin, utils, external: {} }),
            err => err.status === 400 && /imageBase64/.test(err.message)
        )
    })

    it('lets a manager close an order without a photo', async () => {
        const admin = makeAdmin({ permissions: ['order:ship:manage'] })
        const { DL, utils, calls } = makeHarness(shippedOrder)

        const res = await deliver({ orderId: 'o1' }, { DL, _admin: admin, utils, external: {} })

        assert.equal(res.url, null)
        assert.equal(calls.orderUpdate.update.$set.deliveryProof.url, null)
    })

    it('records the proof when the shipper photographs the delivery', async () => {
        const admin = makeAdmin({ permissions: ['order:ship'] })
        const { DL, utils, calls } = makeHarness(shippedOrder)

        const res = await deliver({ orderId: 'o1', imageBase64: TINY_PNG }, { DL, _admin: admin, utils, external: {} })

        assert.ok(res.url)
        assert.equal(calls.orderUpdate.update.$set.deliveryProof.url, res.url)
    })

    it('the skip rule is the same one the camera screen shows the button for', () => {
        assert.equal(maySkipPhoto(makeAdmin({ permissions: ['order:ship'] })), false)
        assert.equal(maySkipPhoto(makeAdmin({ permissions: ['order:ship:manage'] })), true)
        assert.equal(maySkipPhoto(makeAdmin({ permissions: ['order:ship'], isSuperAdmin: true })), true)
    })
})
