/**
 * Import GovMap addresses from data.gov.il open datasets to local DB (HASHSET).
 * Sources (CC-BY 4.0, monthly updated):
 *  - Cities: https://data.gov.il/dataset/cities
 *  - Streets: https://data.gov.il/dataset/streets
 * Usage: node server/scripts/runGovImport.js
 * Env: MONGODB_URI, GOV_PAGE_SIZE
 * Cron: server/cron/nightlySync.js weekly (Sunday 03:00)
 *
 * The streets feed is 152k rows but only ~64k official streets: the rest are
 * synonyms ("בן זכאי" → "יוחנן בן זכאי"). Importing them as separate streets is
 * what made autocomplete offer names Google does not know. This import collapses
 * every city+official_code into one document and keeps the synonyms in
 * `aliases`, so autocomplete shows the official name and still searches the
 * aliases.
 *
 * Streams one CKAN page at a time and writes it before fetching the next, so
 * the rows never sit in memory together. Officials are upserted with $set, then
 * aliases with $addToSet; both write only the rows of the current page.
 */
import seedCache from '#server/dl/cache/seed.js'
import {
    buildAliasRecord,
    buildCityDoc,
    buildOfficialStreetDoc
} from './govAddressData.js'

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
        fields: 'city_name,street_code,street_name,street_name_status,official_code',
        limit: PAGE_SIZE
    }
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

async function importFromApi(DL) {
    const Model = DL.GovAddress?.Model || DL.GovAddress
    if (!Model) throw new Error('GovAddress model not found')

    // Clear only once the API actually returned rows, so a failed fetch leaves
    // the previous month's data (and cache) intact instead of an empty table.
    let cleared = false
    const clearOnce = async () => {
        if (cleared) return
        await Model.deleteMany({})
        cleared = true
    }

    const citySeen = new Set()
    const cities = await streamRecords(DATASETS.cities, async records => {
        const docs = []
        for (const record of records) {
            const doc = buildCityDoc(record, citySeen)
            if (doc) docs.push(doc)
        }
        if (!docs.length) return 0
        await clearOnce()
        await Model.insertMany(docs, { ordered: false })
        return docs.length
    })

    let officialCount = 0
    let aliasCount = 0
    const streets = await streamRecords(DATASETS.streets, async records => {
        const officialSeen = new Set()
        const aliasSeen = new Set()
        const officials = []
        const aliases = []

        for (const record of records) {
            const doc = buildOfficialStreetDoc(record, officialSeen)
            if (doc) {
                officials.push(doc)
                continue
            }
            const alias = buildAliasRecord(record, aliasSeen)
            if (alias) aliases.push(alias)
        }

        if (!officials.length && !aliases.length) return 0
        await clearOnce()
        officialCount += await writeOfficials(Model, officials)
        aliasCount += await writeAliases(Model, aliases)
        return officials.length + aliases.length
    })

    if (!cleared) throw new Error('data.gov.il returned no records')

    const orphans = await countOrphans(Model)
    console.log(`[govmap] Imported ${officialCount} official streets + ${aliasCount} aliases (${cities} cities, ${streets} street rows, ${orphans} orphan aliases)`)

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

// Official rows are authoritative: $set the name so a fallback doc created by
// an earlier alias page is corrected when its official row arrives.
function writeOfficials(Model, docs) {
    if (!docs.length) return 0
    return Model.bulkWrite(docs.map(doc => ({
        updateOne: {
            filter: { city: doc.city, officialCode: doc.officialCode },
            update: {
                $set: { street: doc.street, streetCode: doc.streetCode, fallback: false },
                $setOnInsert: { aliases: [] }
            },
            upsert: true
        }
    })), { ordered: false })
        .then(res => {
            warnWriteErrors('official', res)
            return docs.length
        })
}

// A synonym whose official row has not been imported (yet) still needs a home:
// the upsert creates a fallback doc with the alias as its display name.
function writeAliases(Model, aliases) {
    if (!aliases.length) return 0
    return Model.bulkWrite(aliases.map(doc => ({
        updateOne: {
            filter: { city: doc.city, officialCode: doc.officialCode },
            update: {
                $setOnInsert: {
                    city: doc.city,
                    officialCode: doc.officialCode,
                    street: doc.alias,
                    streetCode: doc.streetCode,
                    fallback: true
                },
                $addToSet: { aliases: doc.alias }
            },
            upsert: true
        }
    })), { ordered: false })
        .then(res => {
            warnWriteErrors('alias', res)
            return aliases.length
        })
}

function warnWriteErrors(kind, res) {
    const errors = res?.writeErrors?.length || 0
    if (errors) console.warn(`[govmap] ${kind} bulk write reported ${errors} write error(s)`)
}

async function countOrphans(Model) {
    try {
        return typeof Model.countDocuments === 'function'
            ? await Model.countDocuments({ fallback: true })
            : 0
    } catch {
        return 0
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
