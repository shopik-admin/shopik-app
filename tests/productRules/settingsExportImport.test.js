import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import exp from '../../server/api/setting/export.js'
import imp from '../../server/api/setting/import.js'

const admin = { isSuperAdmin: true, hasPermission: () => true }

function fakeDL({ existing = {}, domains = ['d1'] } = {}) {
    const store = new Map(Object.entries(existing))
    const created = []
    return {
        created,
        store,
        Setting: {
            async read() {
                return [...store.entries()].map(([id, value]) => ({ ...value, id }))
            },
            async readOne({ domainId, key }) {
                for (const [id, value] of store)
                    if (value.domainId === domainId && value.key === key) return { ...value, id }
                return null
            },
            async create(entry) {
                const id = `${entry.domainId}::${entry.key}`
                store.set(id, entry)
                created.push(entry)
            },
            async updateOne() { }
        },
        Domain: {
            async readById(id) { return domains.includes(id) ? { id } : null }
        }
    }
}

describe('setting export/import', () => {
    it('keeps the reserved global product-rules row out of exports', async () => {
        const DL = fakeDL()
        DL.store.set('global', {
            key: 'product_rules',
            domainId: '__global__',
            value: { groups: [] },
            category: 'orders',
            subCategory: 'product_rules'
        })
        DL.store.set('d1::limits', {
            key: 'limits',
            domainId: 'd1',
            value: { minSum: 100 },
            category: 'orders',
            subCategory: 'limits'
        })

        const res = await exp({}, { DL })
        assert.deepEqual(res.settings.map(s => s.key), ['limits'])
    })

    it('refuses to create a per-domain product-rules row from a settings file', async () => {
        const DL = fakeDL()
        const res = await imp({
            domainId: 'd1',
            settings: [{ key: 'product_rules', value: { groups: [] }, category: 'orders' }]
        }, { DL, _admin: admin })

        assert.equal(res.created, 0)
        assert.deepEqual(res.skippedReserved, ['product_rules'])
        assert.equal(DL.store.size, 0)
    })

    it('still imports ordinary settings next to a reserved entry', async () => {
        const DL = fakeDL()
        const res = await imp({
            domainId: 'd1',
            settings: [
                { key: 'product_rules', value: { groups: [] } },
                { key: 'site_title', value: 'Shop', category: 'general' }
            ]
        }, { DL, _admin: admin })

        assert.equal(res.created, 1)
        assert.equal(DL.created[0].key, 'site_title')
        assert.equal(DL.created[0].domainId, 'd1')
    })
})
