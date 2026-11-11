import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import sortCartByCategory, { withSortedCart } from '#server/utils/data/sortCartByCategory.js'

const line = (barcode, categoryId) => ({
    barcode,
    category: categoryId ? { id: categoryId } : undefined
})

describe('ops cart category sort', () => {
    it('groups by L1, then L2, then L3, keeping each group contiguous', () => {
        const cart = [
            line('wine-l3', 'nc:9:904:9142'),
            line('meat-l2', 'nc:203:2003'),
            line('wine-l2', 'nc:9:904'),
            line('meat-l3', 'nc:203:2003:3002'),
            line('meat-other', 'nc:203:2005'),
        ]

        assert.deepEqual(
            sortCartByCategory(cart).map(item => item.barcode),
            ['meat-l2', 'meat-l3', 'meat-other', 'wine-l2', 'wine-l3']
        )
    })

    it('keeps the cart order inside one category and puts uncategorized lines last', () => {
        const cart = [
            line('unknown-1'),
            line('fruit-1', 'nc:216:2016'),
            line('unknown-2'),
            line('fruit-2', 'nc:216:2016'),
        ]

        assert.deepEqual(
            sortCartByCategory(cart).map(item => item.barcode),
            ['fruit-1', 'fruit-2', 'unknown-1', 'unknown-2']
        )
    })

    it('leaves the cart untouched and returns a sorted copy of the order', () => {
        const cart = [line('b', 'nc:9:904'), line('a', 'nc:203:2003')]
        const order = { id: 'o1', cart }

        const sorted = withSortedCart(order)

        assert.deepEqual(sorted.cart.map(item => item.barcode), ['a', 'b'])
        // The endpoint must not rearrange the stored cart.
        assert.deepEqual(cart.map(item => item.barcode), ['b', 'a'])
        assert.equal(withSortedCart({ id: 'no-cart' }).cart, undefined)
    })
})
