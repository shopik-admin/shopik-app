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

function applyUpdate(doc, update) {
    if (update.$set) Object.assign(doc, update.$set)
    if (update.$setOnInsert) {
        for (const [key, value] of Object.entries(update.$setOnInsert))
            if (doc[key] === undefined) doc[key] = value
    }
    if (update.$addToSet) {
        for (const [key, value] of Object.entries(update.$addToSet)) {
            doc[key] ??= []
            if (!doc[key].includes(value)) doc[key].push(value)
        }
    }
}

function fakeDL() {
    const inserted = []
    const insertCalls = []
    const bulkCalls = []
    const cacheBatches = []
    const redisDeletes = []
    const Model = {
        modelName: 'GovAddress',
        cacheStrategy: CACHE_STRATEGIES.HASHSET,
        cacheName: 'gov_addresses',
        cache: { add: async batch => { cacheBatches.push(batch) } },
        deleteMany: async () => { inserted.length = 0 },
        insertMany: async docs => { insertCalls.push(docs.length); inserted.push(...docs) },
        bulkWrite: async ops => {
            bulkCalls.push(ops)
            for (const op of ops) {
                const { filter, update } = op.updateOne
                const doc = inserted.find(d =>
                    d.city === filter.city && d.officialCode === filter.officialCode)
                if (doc) applyUpdate(doc, update)
                else {
                    const created = { city: filter.city, officialCode: filter.officialCode }
                    applyUpdate(created, update)
                    inserted.push(created)
                }
            }
        },
        countDocuments: async filter => inserted.filter(doc =>
            Object.entries(filter).every(([key, value]) => doc[key] === value)
        ).length,
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
    return { DL, inserted, insertCalls, bulkCalls, cacheBatches, redisDeletes }
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
        const { DL, inserted, insertCalls, bulkCalls, cacheBatches, redisDeletes } = fakeDL()
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
            {
                city: 'A',
                street: 'Herzl',
                streetCode: '',
                officialCode: 'Herzl',
                aliases: [],
                fallback: false
            },
            {
                city: 'A',
                street: 'Dizengoff',
                streetCode: '',
                officialCode: 'Dizengoff',
                aliases: [],
                fallback: false
            },
            {
                city: 'B',
                street: 'Main',
                streetCode: '',
                officialCode: 'Main',
                aliases: [],
                fallback: false
            }
        ])
        // Cities use one insertMany per non-empty page; streets use one
        // bulkWrite per page phase, never one call for everything.
        assert.deepEqual(insertCalls, [1, 1])
        assert.deepEqual(bulkCalls.map(ops => ops.length), [1, 2])
        // The hashset is rebuilt from Mongo in chunks after the write.
        assert.deepEqual(cacheBatches.map(b => b.length), [5])
        assert.deepEqual(redisDeletes, ['gov_addresses'])
    })

    it('collapses official streets and their synonyms into one doc', async () => {
        const { DL, inserted } = fakeDL()
        stubFetch({
            'cities-test': [{ city_name: 'ביתר עילית' }],
            'streets-test': [
                {
                    city_name: 'ביתר עילית',
                    street_code: '123',
                    street_name: 'יוחנן בן זכאי',
                    street_name_status: 'official',
                    official_code: 123
                },
                {
                    city_name: 'ביתר עילית',
                    street_code: '9569',
                    street_name: 'בן זכאי',
                    street_name_status: 'synonym of 123',
                    official_code: 123
                },
                {
                    city_name: 'ביתר עילית',
                    street_code: '9570',
                    street_name: 'רבן יוחנן בן זכאי',
                    street_name_status: 'synonym of 123',
                    official_code: 123
                },
                {
                    city_name: 'ביתר עילית',
                    street_code: '9599',
                    street_name: 'רחוב יתום',
                    street_name_status: 'synonym of 999',
                    official_code: 999
                }
            ]
        })

        await importGovAddresses({ DL })

        const streets = inserted.filter(doc => doc.street)
        const official = streets.find(doc => doc.officialCode === '123')
        const orphan = streets.find(doc => doc.officialCode === '999')

        assert.equal(official.street, 'יוחנן בן זכאי')
        assert.equal(official.fallback, false)
        assert.deepEqual(official.aliases.sort(), ['בן זכאי', 'רבן יוחנן בן זכאי'].sort())
        // A synonym with no official row still gets a fallback doc.
        assert.equal(orphan.street, 'רחוב יתום')
        assert.equal(orphan.fallback, true)
        assert.deepEqual(orphan.aliases, ['רחוב יתום'])
    })

    it('leaves existing rows and cache untouched when the feed is down', async () => {
        const { DL, inserted, cacheBatches, redisDeletes } = fakeDL()
        globalThis.fetch = async () => ({ ok: false, status: 503 })

        await importGovAddresses({ DL })

        assert.deepEqual(inserted, [])
        assert.deepEqual(cacheBatches, [])
        assert.deepEqual(redisDeletes, [])
    })

    it('fails the run (without wiping) when the feed returns no rows', async () => {
        const { DL, inserted, redisDeletes } = fakeDL()
        stubFetch({ 'cities-test': [], 'streets-test': [] })

        await importGovAddresses({ DL })

        assert.deepEqual(inserted, [])
        assert.deepEqual(redisDeletes, [])
    })
})
