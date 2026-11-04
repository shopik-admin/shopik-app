import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateProximity } from '../../server/api/shipment/deliver.js'

const order = { address: { location: { coordinates: [34.78, 32.08] } } }

describe('shipment/deliver proximity', () => {
    it('passes when the admin is at the customer address', () => {
        const result = evaluateProximity({ order, coordinates: [34.78, 32.08] })
        assert.equal(result.overridden, false)
        assert.equal(Math.round(result.distanceM), 0)
    })

    it('rejects a delivery that is too far without an override', () => {
        assert.throws(
            () => evaluateProximity({ order, coordinates: [34.9, 32.08] }),
            err => err.status === 400 && /too far/.test(err.message)
        )
    })

    it('rejects an override from a caller without order:ship:manage', () => {
        assert.throws(
            () => evaluateProximity({ order, coordinates: [34.9, 32.08], override: true, canOverride: false }),
            err => err.status === 403
        )
    })

    it('allows an explicit override from a manager and reports the distance', () => {
        const result = evaluateProximity({ order, coordinates: [34.9, 32.08], override: true, canOverride: true })
        assert.equal(result.overridden, true)
        assert.ok(result.distanceM > result.radiusM)
    })

    it('returns null when GPS or the customer address is missing', () => {
        assert.equal(evaluateProximity({ order }), null)
        assert.equal(evaluateProximity({ order: {}, coordinates: [34.78, 32.08] }), null)
    })
})
