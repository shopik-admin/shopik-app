import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { noServiceAddressFromSave } from '../../common/functions/address.js'

// AddressForm's onDone receives the whole API response. Regression: passing it
// straight to the no-service state treated every successful save as an
// out-of-service address and showed the "באסה" screen even when it has service.
describe('no-service screen trigger', () => {
    const address = { city: 'ירושלים', street: 'הרצל', building: 14 }

    it('does not open for a saved address with service', () => {
        assert.equal(noServiceAddressFromSave({ user: {}, address: { ...address, hasService: true } }), null)
    })

    it('does not open when the response has no address (edit with no change)', () => {
        assert.equal(noServiceAddressFromSave({ user: {} }), null)
        assert.equal(noServiceAddressFromSave(undefined), null)
    })

    it('opens for a saved address without service', () => {
        const saved = { ...address, hasService: false }
        assert.equal(noServiceAddressFromSave({ user: {}, address: saved }), saved)
    })
})
