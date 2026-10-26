import boot from '../boot.js'
import importComaxProducts from '../api/comax_product/import.js'

// Manual run of the nightly Comax feed (per-store in-stock + fresh departments).
// The cron does the same thing at NIGHTLY_SYNC_CRON; this is for a first
// backfill or a re-run after fixing the fresh department list.
const bootData = await boot()

const startedAt = Date.now()
console.log('[runComaxProductImport] Boot done')

const result = await importComaxProducts({}, bootData)

console.log('[runComaxProductImport] Result:', JSON.stringify(result, null, 1))
console.log(`[runComaxProductImport] Done in ${Math.round((Date.now() - startedAt) / 1000)}s`)
process.exit(0)
