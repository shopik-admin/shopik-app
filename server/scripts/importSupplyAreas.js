/**
 * One-time import: bring-bring-db.areas -> supply_areas
 * Maps: areaKey -> name, location -> location (GeoJSON Polygon)
 * Usage:
 *   node server/scripts/runSupplyAreaImport.js --dry-run   # no writes
 *   node server/scripts/runSupplyAreaImport.js              # wipe + import
 *   node server/scripts/runSupplyAreaImport.js --skip-overlap  # allow overlaps
 * Env: SOURCE_DB_URI (default mongodb://localhost:27018)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import { normalizePolygon, validatePolygon, validateNoOverlap } from '../external/supplyArea.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default async function importSupplyAreas({ DL, dryRun = false, skipOverlap = false } = {}) {
    if (!DL) throw new Error('DL required — call importSupplyAreas({ DL })')

    const SOURCE_URI = process.env.SOURCE_DB_URI || 'mongodb://localhost:27018'
    const src = new MongoClient(SOURCE_URI)
    await src.connect()
    console.log(`[supplyAreas] Connected to source ${SOURCE_URI}`)

    const raw = await src.db('bring-bring-db').collection('areas')
        .find({}, { projection: { areaKey: 1, location: 1 } })
        .toArray()
    await src.close()
    console.log(`[supplyAreas] Fetched ${raw.length} docs from bring-bring-db.areas`)

    if (!dryRun) {
        const res = await DL.SupplyArea.Model.deleteMany({})
        console.log(`[supplyAreas] Wiped supply_areas (${res.deletedCount} removed)`)
    } else {
        console.log('[supplyAreas] DRY RUN — no writes')
    }

    let ok = 0, skipped = 0
    const invalid = []
    const overlaps = []

    for (const doc of raw) {
        const name = typeof doc.areaKey === 'string' ? doc.areaKey.trim() : ''
        if (!name || !doc.location?.coordinates) {
            skipped++
            continue
        }

        let loc
        try {
            loc = normalizePolygon(doc.location)
            validatePolygon(loc)
        } catch (e) {
            invalid.push({ areaKey: name, err: e.message || String(e) })
            continue
        }

        if (!skipOverlap) {
            try {
                await validateNoOverlap(DL, loc)
            } catch (e) {
                overlaps.push({ areaKey: name, with: e.message || String(e), location: loc })
                continue
            }
        }

        if (dryRun) { ok++; continue }

        try {
            await DL.SupplyArea.create({ name, location: loc, stores: [] })
            ok++
        } catch (e) {
            invalid.push({ areaKey: name, err: e.message || String(e) })
        }
    }

    console.log(`[supplyAreas] Done — total:${raw.length} inserted:${ok} skipped:${skipped} invalid:${invalid.length} overlaps:${overlaps.length}`)
    if (invalid.length) {
        console.log('[supplyAreas] Invalid (first 20):')
        console.table(invalid.slice(0, 20))
    }
    if (overlaps.length) {
        console.log('[supplyAreas] Overlaps (first 20):')
        console.table(overlaps.slice(0, 20).map(o => ({ areaKey: o.areaKey, with: o.with })))
        // write full report for triage (geometry included to visualize in map/QGIS)
        const out = path.join(__dirname, 'import-overlaps.json')
        fs.writeFileSync(out, JSON.stringify(overlaps, null, 2))
        console.log(`[supplyAreas] Overlap report written to ${out} (${overlaps.length} entries)`)
    }

    return { total: raw.length, ok, skipped, invalid, overlaps }
}
