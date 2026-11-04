import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { findReplacement, groupCart, isReplacedLine } from '../../common/functions/cartReplacements.js'

describe('groupCart', () => {
    it('shows a replaced product together with the product that supplied its order', () => {
        const cart = [
            { id: 'p1', barcode: 'A', name: 'Original', missing: true, missingReason: 'replaced', replacement: { replacementBarcode: 'B' } },
            { id: 'p2', barcode: 'B', name: 'Replacement', finalAmount: 2, replacement: { originalBarcode: 'A' } }
        ]
        assert.deepEqual(groupCart(cart), [
            { type: 'pair', original: cart[0], replacer: cart[1], key: 'p1->p2' }
        ])
    })

    it('pairs sit at the position of the product that was ordered', () => {
        const cart = [
            { id: 'p1', barcode: 'A', name: 'First', amount: 1 },
            { id: 'p2', barcode: 'B', name: 'Original', missing: true, missingReason: 'replaced', replacement: { replacementBarcode: 'C' } },
            { id: 'p3', barcode: 'C', name: 'Replacement', finalAmount: 1, replacement: { originalBarcode: 'B' } },
            { id: 'p4', barcode: 'D', name: 'Last', amount: 1 }
        ]
        assert.deepEqual(groupCart(cart).map(e => e.type), ['product', 'pair', 'product'])
        assert.deepEqual(groupCart(cart).map(e => e.product?.name || `pair:${e.original.name}`), ['First', 'pair:Original', 'Last'])
    })

    it('pairs from the pricing view alone, when only replacedBy is set', () => {
        const cart = [
            { id: 'p1', barcode: 'A', missing: true, replacedBy: 'B' },
            { id: 'p2', barcode: 'B', finalAmount: 2 }
        ]
        assert.equal(groupCart(cart)[0].type, 'pair')
    })

    it('a replaced original whose replacement line is gone is just a missing item', () => {
        const cart = [{ id: 'p1', barcode: 'A', missing: true, missingReason: 'replaced', replacedBy: 'B' }]
        assert.deepEqual(groupCart(cart), [{ type: 'product', product: cart[0], key: 'p1' }])
    })

    it('gives each original its own replacer when barcodes repeat', () => {
        const cart = [
            { id: 'p1', barcode: 'A', missing: true, replacedBy: 'B' },
            { id: 'p2', barcode: 'B', finalAmount: 1 },
            { id: 'p3', barcode: 'A', missing: true, replacedBy: 'B' },
            { id: 'p4', barcode: 'B', finalAmount: 1 }
        ]
        const pairs = groupCart(cart).filter(e => e.type === 'pair')
        assert.equal(pairs.length, 2)
        assert.deepEqual([pairs[0].replacer.id, pairs[1].replacer.id], ['p2', 'p4'])
    })

    it('skips the replacer line and keeps the empty cart empty', () => {
        assert.deepEqual(groupCart([]), [])
        assert.deepEqual(groupCart([null]), [])
    })
})

describe('findReplacement', () => {
    it('prefers the replacer back-link over the barcode match', () => {
        const cart = [
            { id: 'p1', barcode: 'A', missing: true, replacedBy: 'B' },
            { id: 'p2', barcode: 'B' },
            { id: 'p3', barcode: 'B', replacement: { originalBarcode: 'A' } }
        ]
        assert.equal(findReplacement(cart, cart[0]).id, 'p3')
    })

    it('never pairs a line with itself', () => {
        const cart = [{ id: 'p1', barcode: 'A', missing: true, replacedBy: 'A', replacement: { originalBarcode: 'A' } }]
        assert.equal(findReplacement(cart, cart[0]), null)
    })

    it('reports a replaced line whatever side of the link is recorded', () => {
        assert.equal(isReplacedLine({ missingReason: 'replaced' }), true)
        assert.equal(isReplacedLine({ replacedBy: 'B' }), true)
        assert.equal(isReplacedLine({ replacement: { replacementBarcode: 'B' } }), true)
        assert.equal(isReplacedLine({ missing: true, missingReason: 'missing' }), false)
        assert.equal(isReplacedLine(null), false)
    })
})
