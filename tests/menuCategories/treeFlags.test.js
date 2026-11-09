import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import tree from '#server/api/category/tree.js'

const ACTIVE = 'active'

function fakeDL() {
    const categories = [
        { id: 'nc:1', level: 1, parentId: null, name: 'פירות וירקות' },
        { id: 'nc:1:2', level: 2, parentId: 'nc:1', name: 'פירות' }
    ]
    const mapDocs = [
        // Both flags on: shown as hidden + kashrut in the admin.
        { subGroupCode: '100', categoryId: 'nc:1:2', showOnSite: false, requireKashrut: true },
        { subGroupCode: '101', categoryId: 'nc:1:2', showOnSite: true, requireKashrut: false },
        // Imported before the flags file: no flag fields means show + no rule.
        { subGroupCode: '102', categoryId: 'nc:1:2' }
    ]
    const counts = [
        { _id: '100', count: 2 },
        { _id: '101', count: 1 },
        { _id: '102', count: 3 },
        // Active products whose map row is missing: defaults too.
        { _id: '103', count: 4 }
    ]

    return {
        Product: {
            constants: { STATUS: { ACTIVE } },
            Model: {
                aggregate: async () => counts,
                countDocuments: async () => counts.reduce((sum, row) => sum + row.count, 0)
            }
        },
        Category: { read: async () => categories },
        CategoryMap: { read: async () => mapDocs },
        ComaxProduct: {
            Model: { find: () => ({ lean: async () => [] }) }
        }
    }
}

describe('category tree flags', () => {
    it('returns the flags of every mapped sub-group', async () => {
        const { assigned } = await tree({}, { DL: fakeDL() })
        const byCode = new Map(assigned.map(entry => [entry.code, entry]))

        assert.equal(byCode.get('100').showOnSite, false)
        assert.equal(byCode.get('100').requireKashrut, true)
        assert.equal(byCode.get('101').showOnSite, true)
        assert.equal(byCode.get('101').requireKashrut, false)
        // Missing flags must keep the old behaviour: shown, no kashrut rule.
        assert.equal(byCode.get('102').showOnSite, true)
        assert.equal(byCode.get('102').requireKashrut, false)
    })

    it('uses the same defaults for a sub-group with no map row', async () => {
        const { unassigned } = await tree({}, { DL: fakeDL() })
        const entry = unassigned.find(row => row.code === '103')

        assert.equal(entry.showOnSite, true)
        assert.equal(entry.requireKashrut, false)
    })
})
