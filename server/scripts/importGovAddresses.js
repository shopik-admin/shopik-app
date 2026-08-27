/**
 * Import GovMap addresses from data.gov.il open datasets to local DB (HASHSET).
 * Sources (CC-BY 4.0, monthly updated):
 *  - Cities: https://data.gov.il/dataset/cities
 *  - Streets: https://data.gov.il/dataset/streets
 *  - Buildings: https://data.gov.il/dataset/addresses
 * Usage: node server/scripts/importGovAddresses.js
 * Env: MONGODB_URI, GOV_DATA_DIR (optional local CSV dir)
 * Cron: add to server/cron/nightlySync.js weekly
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Official data.gov.il resource IDs (from @il-address/data, CC-BY 4.0)
const DATASETS = {
    cities: {
        resourceId: process.env.GOV_CITIES_RESOURCE_ID || '8f714b6f-c35c-4b40-a0e7-547b675eee0e',
        limit: 32000
    },
    streets: {
        resourceId: process.env.GOV_STREETS_RESOURCE_ID || 'bf185c7f-1a4e-4662-88c5-fa118a244bda',
        limit: 32000
    }
    // Buildings are not in a single open dataset — building numbers are validated via OSM/Google fallback
}

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
    // Fetch cities + streets from data.gov.il datastore_search (paginated)
    const cities = await fetchAllRecords(DATASETS.cities.resourceId, DATASETS.cities.limit)
    const streetsRaw = await fetchAllRecords(DATASETS.streets.resourceId, DATASETS.streets.limit)
    console.log(`[govmap] Fetched ${cities.length} cities, ${streetsRaw.length} raw street rows`)

    // Deduplicate streets to unique city+street (raw has synonyms)
    const streetMap = new Map()
    for (const r of streetsRaw) {
        const city = (r.city_name ?? r.city_name_he ?? '').toString().trim()
        const street = (r.street_name ?? '').toString().trim()
        if (!city || !street) continue
        const key = `${city}::${street}`
        if (!streetMap.has(key)) streetMap.set(key, { city, street })
    }
    const streets = [...streetMap.values()]
    console.log(`[govmap] Deduped to ${streets.length} unique streets`)

    // Build gov_address docs: one per unique street (building='' placeholder).
    // Keep ALL cities/streets in Redis for fast autocomplete; hasService is checked
    // at validation time via supplyArea lookup (no GM calls during import).
    const docs = []
    for (const s of streets) {
        docs.push({ city: s.city, street: s.street, building: '' })
    }
    // Add city-only docs for city autocomplete (street='' sentinel)
    for (const c of cities) {
        const city = (c.city_name_he ?? c.city_name ?? '').toString().trim()
        if (city) docs.push({ city, street: '', building: '' })
    }

    const Model = DL.GovAddress?.Model || DL.GovAddress
    if (!Model) throw new Error('GovAddress model not found')
    await Model.deleteMany({})
    // Insert in batches to avoid 16MB limit
    const batchSize = 5000
    for (let i = 0; i < docs.length; i += batchSize) {
        await Model.insertMany(docs.slice(i, i + batchSize), { ordered: false })
    }
    if (DL.GovAddress?.cache?.add) await DL.GovAddress.cache.add(docs)
    console.log(`[govmap] Inserted ${docs.length} gov_address docs`)
}

async function fetchAllRecords(resourceId, limit = 32000) {
    let offset = 0
    let all = []
    while (true) {
        const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}&limit=${limit}&offset=${offset}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`datastore_search failed ${res.status}`)
        const json = await res.json()
        if (!json.success) throw new Error(`CKAN error: ${JSON.stringify(json)}`)
        const records = json.result?.records || []
        all = all.concat(records)
        if (records.length < limit || all.length >= (json.result?.total || Infinity)) break
        offset += limit
        // small delay to respect rate limit
        await new Promise(r => setTimeout(r, 200))
    }
    return all
}

function pickField(obj, candidates) {
    const keys = Object.keys(obj)
    for (const c of candidates) {
        const found = keys.find(k => k.toLowerCase() === c.toLowerCase() || k.includes(c))
        if (found && obj[found] != null && String(obj[found]).trim() !== '') return obj[found]
    }
    // fallback: first non-empty text field
    return null
}

export default importGovAddresses

// Allow direct run: node server/scripts/importGovAddresses.js
if (import.meta.url.endsWith('importGovAddresses.js')) {
    // Will be invoked with DL from boot context in production
    console.log('Import script ready — integrate with server/cron/nightlySync.js')
}
