import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CACHE_STRATEGIES } from '../../common/constants.js'

// The dataset config is read at module load, so set the small page size before
// importing. Each test file runs in its own process.
process.env.GOV_PAGE_SIZE = '2'
process.env.GOV_CITIES_RESOURCE_ID = 'cities-test'
process.env.GOV_STREETS_RESOURCE_ID = 'streets-test'
const { default: importGovAddresses } = await import('../../server/scripts/importGovAddresses.js')

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

function fakeDL() {
    const inserted = []
    const insertCalls = []
    let deleteCalls = 0
    const cacheBatches = []
    const redisDeletes = []
    const Model = {
        modelName: 'GovAddress',
        cacheStrategy: CACHE_STRATEGIES.HASHSET,
        cacheName: 'gov_addresses',
        cache: { add: async batch => { cacheBatches.push(batch) } },
        deleteMany: async () => { deleteCalls++; inserted.length = 0 },
        insertMany: async docs => { insertCalls.push(docs.length); inserted.push(...docs) },
        find: () => ({
            lean: () => ({
                cursor: () => (async function* () {
                    for (const doc of inserted) yield doc
                })()
            })
        })
    }
    const DL = {
        redis: { status: 'ready', del: async key => { redisDeletes.push(key) } },
        GovAddress: { Model }
    }
    return { DL, inserted, insertCalls, cacheBatches, redisDeletes, deleteCalls: () => deleteCalls }
}

function stubFetch(rowsByResource) {
    const calls = []
    globalThis.fetch = async url => {
        const u = new URL(url)
        const resourceId = u.searchParams.get('resource_id')
        const offset = Number(u.searchParams.get('offset'))
        const limit = Number(u.searchParams.get('limit'))
        const rows = rowsByResource[resourceId] || []
        calls.push({ resourceId, offset })
        return {
            ok: true,
            json: async () => ({
                success: true,
                result: { records: rows.slice(offset, offset + limit), total: rows.length }
            })
        }
    }
    return calls
}

describe('importGovAddresses', () => {
    it('writes one page at a time and dedupes city+street rows', async () => {
        const { DL, inserted, insertCalls, cacheBatches, redisDeletes, deleteCalls } = fakeDL()
        stubFetch({
            'cities-test': [
                { city_name_he: 'A' },
                { city_name: 'A' },
                { city_name_he: 'B' },
                { city_name_he: '   ' }
            ],
            'streets-test': [
                { city_name_he: 'A', street_name: 'Herzl' },
                { city_name_he: 'A', street_name: 'Herzl' },
                { city_name_he: 'A', street_name: 'Dizengoff' },
                { city_name_he: 'B', street_name: 'Main' },
                { city_name_he: '', street_name: 'Nowhere' }
            ]
        })

        await importGovAddresses({ DL })

        assert.deepEqual(inserted, [
            { city: 'A', street: '' },
            { city: 'B', street: '' },
            { city: 'A', street: 'Herzl' },
            { city: 'A', street: 'Dizengoff' },
            { city: 'B', street: 'Main' }
        ])
        // One insertMany per non-empty CKAN page, never one call for everything.
        assert.deepEqual(insertCalls, [1, 1, 1, 2])
        assert.equal(deleteCalls(), 1)
        // The hashset is rebuilt from Mongo in chunks after the write.
        assert.deepEqual(cacheBatches.map(b => b.length), [5])
        assert.deepEqual(redisDeletes, ['gov_addresses'])
    })

    it('leaves existing rows and cache untouched when the feed is down', async () => {
        const { DL, inserted, cacheBatches, redisDeletes, deleteCalls } = fakeDL()
        globalThis.fetch = async () => ({ ok: false, status: 503 })

        await importGovAddresses({ DL })

        assert.deepEqual(inserted, [])
        assert.equal(deleteCalls(), 0)
        assert.deepEqual(cacheBatches, [])
        assert.deepEqual(redisDeletes, [])
    })

    it('fails the run (without wiping) when the feed returns no rows', async () => {
        const { DL, inserted, redisDeletes, deleteCalls } = fakeDL()
        stubFetch({ 'cities-test': [], 'streets-test': [] })

        await importGovAddresses({ DL })

        assert.deepEqual(inserted, [])
        assert.equal(deleteCalls(), 0)
        assert.deepEqual(redisDeletes, [])
    })
})
