/**
 * One-off purge of the geocode cache.
 *
 * Entries written before the GovMap→Google chain could hold a wrong-city point
 * (e.g. "בן זכאי 3 ביתר עילית" cached in Jerusalem). ROOFTOP entries never
 * expire, so without this purge the old answers keep coming back for existing
 * addresses even after the new chain is deployed.
 *
 * Dry run by default:
 *   node server/scripts/purgeGeocodeCache.js
 * Apply:
 *   node server/scripts/purgeGeocodeCache.js --execute
 */
import boot from '../boot.js'

const execute = process.argv.slice(2).includes('--execute')
const bootData = await boot()
const { DL } = bootData

const Model = DL?.GeocodeCache?.Model || DL?.GeocodeCache
if (!Model) {
    console.error('[purge] GeocodeCache model not found')
    process.exit(1)
}

const total = await Model.countDocuments({}).catch(() => null)
console.log(`[purge] GeocodeCache documents: ${total ?? 'unknown'}`)
if (!execute) {
    console.log('[purge] dry run — pass --execute to delete these rows and clear the Redis hashset')
    process.exit(0)
}

const deleted = await Model.deleteMany({})
console.log(`[purge] deleted ${deleted?.deletedCount ?? 0} rows`)

try {
    if (DL.redis?.status === 'ready' && Model.cacheName)
        await DL.redis.del(Model.cacheName)
    else
        await Model.cache?.clear?.()
    console.log('[purge] cleared the geocode_cache hashset')
} catch (e) {
    console.warn('[purge] cache clear failed:', e?.message || e)
}

process.exit(0)
