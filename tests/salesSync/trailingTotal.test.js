import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { trailingTotalForSale } from '../../server/api/comax_sale/sync.js'

describe('comax sale deposit total', () => {
    it('adds the deposits of a bundle (3 bottles x 0.30)', () => {
        const map = new Map([
            ['4002631025069', 0.3],
            ['4002631025830', 0.3]
        ])

        assert.equal(trailingTotalForSale({
            barcodes: ['4002631025069', '4002631025830'],
            amount: 3,
            barcodeToDepositMap: map
        }), 0.9)
    })

    it('adds nothing when no eligible item carries a deposit', () => {
        const map = new Map([['1000', 0]])

        assert.equal(trailingTotalForSale({
            barcodes: ['1000'],
            amount: 3,
            barcodeToDepositMap: map
        }), 0)
    })

    it('uses the cheapest eligible deposit for a mixed bundle', () => {
        const map = new Map([
            ['bottle', 0.3],
            ['bag', 0]
        ])

        assert.equal(trailingTotalForSale({
            barcodes: ['bottle', 'bag'],
            amount: 3,
            barcodeToDepositMap: map
        }), 0)
    })

    it('is zero without a map or amount', () => {
        assert.equal(trailingTotalForSale({ barcodes: ['1000'], amount: 3 }), 0)
        assert.equal(trailingTotalForSale({ barcodes: ['1000'], amount: 0, barcodeToDepositMap: new Map([['1000', 0.3]]) }), 0)
    })
})
