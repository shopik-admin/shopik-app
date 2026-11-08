import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { siblingTargetFor } from '../../admin/Pages/MenuCategories/siblingTarget.js'

const categories = [
    { id: 'nc:216', parentId: null },
    { id: 'nc:216:2016', parentId: 'nc:216' },
    { id: 'nc:216:2016:3001', parentId: 'nc:216:2016' },
    { id: 'nc:216:2017', parentId: 'nc:216' },
    { id: 'nc:216:2017:3003', parentId: 'nc:216:2017' },
    { id: 'nc:203', parentId: null },
    { id: 'nc:203:2003', parentId: 'nc:203' },
    { id: 'nc:203:2003:3002', parentId: 'nc:203:2003' }
]
const byId = new Map(categories.map(category => [category.id, category]))

const target = (draggedId, overId) => siblingTargetFor(byId.get(draggedId), overId, byId)

describe('category drag drop target', () => {
    it('keeps a plain sibling drop', () => {
        assert.equal(target('nc:216', 'nc:203'), 'nc:203')
        assert.equal(target('nc:216:2016', 'nc:216:2017'), 'nc:216:2017')
    })

    it('walks up from a hovered child to the sibling that was meant', () => {
        // Dropping a top-level category onto a leaf under another top-level
        // category is a drop onto that top-level category.
        assert.equal(target('nc:216', 'nc:203:2003:3002'), 'nc:203')
        assert.equal(target('nc:216:2016', 'nc:216:2017:3003'), 'nc:216:2017')
        // The walk stops at the parent level: an L3 leaf under a different L2
        // has no sibling group in common with this L3, so nothing is reordered.
        assert.equal(target('nc:216:2016:3001', 'nc:216:2017:3003'), null)
    })

    it('refuses a drop that is not a reorder', () => {
        assert.equal(target('nc:216', 'nc:216'), null, 'onto itself')
        assert.equal(target('nc:216', 'nc:216:2016'), null, 'onto its own child')
        assert.equal(target('nc:216', 'nc:203'), 'nc:203')
        assert.equal(target('nc:203:2003:3002', 'nc:216:2016'), null, 'cross-parent')
    })

    it('tolerates unknown or missing ids', () => {
        assert.equal(target('nc:216', 'nope'), null)
        assert.equal(target('nope', 'nc:216'), null)
        assert.equal(target('nc:216', null), null)
        assert.equal(siblingTargetFor(null, 'nc:216', byId), null)
    })
})
