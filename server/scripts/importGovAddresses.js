/**
 * Import GovMap addresses from data.gov.il open datasets to local DB (HASHSET).
 * Sources (CC-BY 4.0, monthly updated):
 *  - Cities: https://data.gov.il/dataset/cities
 *  - Streets: https://data.gov.il/dataset/streets
 *  - Buildings: https://data.gov.il/dataset/addresses
 * Usage: node server/scripts/importGovAddresses.js
 * Env: MONGODB_URI, GOV_DATA_DIR (optional local CSV dir), GOV_PAGE_SIZE
 * Cron: add to server/cron/nightlySync.js weekly
 *
 * Streams one CKAN page at a time and writes it before fetching the next, so
 * the ~150k rows never sit in memory together. The old version concatenated
 * every page into `all`, built a Map + a 153k `docs` array, then handed the
 * whole array to `cache.add` (one JSON string per doc before the first HSET):
 * ~300MB of heap on a 512MB box. The cache is now rebuilt by the shared
 * chunked `seedCache` after the DB write, so the peak stays flat.
 */
import seedCache from '#server/dl/cache/seed.js'

// Official data.gov.il resource IDs (from @il-address/data, CC-BY 4.0)
// 10k rows/page keeps the parsed page small (the feed is ~152k rows) while
// still being only ~16 requests. Override with GOV_PAGE_SIZE.
const PAGE_SIZE = Number(process.env.GOV_PAGE_SIZE) || 10000
const DATASETS = {
    cities: {
        resourceId: process.env.GOV_CITIES_RESOURCE_ID || '8f714b6f-c35c-4b40-a0e7-547b675eee0e',
        fields: 'city_name_he',
        limit: PAGE_SIZE
    },
    streets: {
        resourceId: process.env.GOV_STREETS_RESOURCE_ID || 'bf185c7f-1a4e-4662-88c5-fa118a244bda',
        fields: 'city_name,street_name',
        limit: PAGE_SIZE
    }
    // Buildings are not in a single open dataset — building numbers are validated via OSM/Google fallback
}

const PAGE_DELAY_MS = 200

async function importGovAddresses({ DL } = {}) {
    if (!DL) {
        console.log('DL required — call importGovAddresses({ DL }) from boot/cron')
        return
    }

    console.log('[govmap] Starting import to GovAddress (single collection)...')

    try {
        await importFromApi(DL)
    } catch (e) {
        console.warn('[govmap] API import failed ', e.message)
    }

    console.log('[govmap] Import done')
}

const cityOf = r => (r.city_name_he ?? r.city_name ?? '').toString().trim()

// One city-only doc per city for city autocomplete (street='' sentinel).
function buildCityDoc(r, seen) {
    const city = cityOf(r)
    if (!city) return null
    const key = `${city}::`
    if (seen.has(key)) return null
    seen.add(key)
    return { city, street: '' }
}

// One doc per unique city+street (the raw feed repeats rows via synonyms).
function buildStreetDoc(r, seen) {
    const city = cityOf(r)
    const street = (r.street_name ?? '').toString().trim()
    if (!city || !street) return null
    const key = `${city}::${street}`
    if (seen.has(key)) return null
    seen.add(key)
    return { city, street }
}

async function importFromApi(DL) {
    const Model = DL.GovAddress?.Model || DL.GovAddress
    if (!Model) throw new Error('GovAddress model not found')

    const seen = new Set()
    let cleared = false
    // Clear only once the API actually returned rows, so a failed fetch leaves
    // the previous month's data (and cache) intact instead of an empty table.
    const insertPage = async docs => {
        if (!docs.length) return 0
        if (!cleared) {
            await Model.deleteMany({})
            cleared = true
        }
        await Model.insertMany(docs, { ordered: false })
        return docs.length
    }

    const importDataset = (dataset, buildDoc) =>
        streamRecords(dataset, async records => {
            const docs = []
            for (const r of records) {
                const doc = buildDoc(r, seen)
                if (doc) docs.push(doc)
            }
            return insertPage(docs)
        })

    const cities = await importDataset(DATASETS.cities, buildCityDoc)
    const streets = await importDataset(DATASETS.streets, buildStreetDoc)
    if (!cleared) throw new Error('data.gov.il returned no records')

    console.log(`[govmap] Inserted ${streets} street rows + ${cities} city rows`)

    // The cache is keyed by doc content, not _id, so the fresh insert is a
    // full replacement: drop the old hash and stream the collection back in.
    const redis = DL.redis
    if (redis?.status === 'ready') {
        const seeded = await seedCache(redis, Model, { clear: true })
        console.log(`[govmap] Seeded ${seeded} gov_address docs into the hashset`)
    } else {
        console.warn('[govmap] Redis unavailable — cache refresh deferred to the next boot seed')
    }
}

async function streamRecords(dataset, onPage) {
    const { resourceId, fields, limit } = dataset
    let offset = 0
    let written = 0
    for (;;) {
        // Only the columns the doc needs: the full row is ~200 bytes vs ~50
        // projected, and this dataset is 152k rows, all parsed page by page.
        const params = new URLSearchParams({ resource_id: resourceId, limit: String(limit), offset: String(offset) })
        if (fields) params.set('fields', fields)
        const res = await fetch(`https://data.gov.il/api/3/action/datastore_search?${params}`)
        if (!res.ok) throw new Error(`datastore_search failed ${res.status}`)
        const json = await res.json()
        if (!json.success) throw new Error(`CKAN error: ${JSON.stringify(json)}`)
        const records = json.result?.records || []
        if (!records.length) break
        written += await onPage(records)
        offset += records.length
        if (records.length < limit || offset >= (json.result?.total || 0)) break
        // small delay to respect rate limit
        await new Promise(r => setTimeout(r, PAGE_DELAY_MS))
    }
    return written
}

export default importGovAddresses
