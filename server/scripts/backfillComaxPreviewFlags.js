import boot from '../boot.js'
import { backfillPreviewFlags } from '../services/comaxCategorySettings/preview.js'

// One-off fill of the denormalised product-preview flags on comax_products:
// siteStatus, hasImage, inGs1 and kashrutValid. The nightly sync keeps them up
// to date afterwards; this is for rows that have not been through a sync since
// the fields were introduced.
//
// Usage: node server/scripts/backfillComaxPreviewFlags.js [--batch N]
const args = process.argv.slice(2)
const batchArg = args.find(arg => arg.startsWith('--batch='))
const batchSize = batchArg ? Number(batchArg.slice('--batch='.length)) : 1000

const { DL } = await boot()
const startedAt = Date.now()
const result = await backfillPreviewFlags({ DL, batchSize })
console.log(`[backfillComaxPreviewFlags] scanned ${result.scanned}, updated ${result.updated} in ${Math.round((Date.now() - startedAt) / 1000)}s`)
process.exit(0)
