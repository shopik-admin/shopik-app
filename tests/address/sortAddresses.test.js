import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sortAddressesActiveFirst } from '../../common/functions/address.js'

describe('sortAddressesActiveFirst', () => {
    it('puts the active address first and keeps the rest in order', () => {
        const addresses = [
            { addressId: 'a', active: false },
            { addressId: 'b', active: true },
            { addressId: 'c', active: false }
        ]

        assert.deepEqual(
            sortAddressesActiveFirst(addresses).map(({ addressId }) => addressId),
            ['b', 'a', 'c']
        )
    })

    it('does not mutate the original list', () => {
        const addresses = [{ addressId: 'a' }, { addressId: 'b', active: true }]
        sortAddressesActiveFirst(addresses)
        assert.deepEqual(addresses.map(({ addressId }) => addressId), ['a', 'b'])
    })

    it('handles an empty or missing list', () => {
        assert.deepEqual(sortAddressesActiveFirst(), [])
        assert.deepEqual(sortAddressesActiveFirst([]), [])
    })
})
