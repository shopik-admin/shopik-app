import boot from '../boot.js'
import reprocessProductImages from './reprocessProductImages.js'

// One-off backfill for the bounded-box resize.
// Usage: node server/scripts/runReprocessProductImages.js [--dry-run]
//          [--limit N] [--productId ID] [--concurrency N]
const args = process.argv.slice(2)
const flag = (name, def) => {
    const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`))
    if (i === -1) return def
    const eq = args[i].indexOf('=')
    if (eq !== -1) return args[i].slice(eq + 1)
    const next = args[i + 1]
    return next && !next.startsWith('--') ? next : true
}

const bootData = await boot()
console.log('[runReprocessProductImages] Boot done, starting...')
await reprocessProductImages(bootData, {
    dryRun: !!flag('dry-run', false),
    limit: Number(flag('limit', 0)) || 0,
    productId: String(flag('productId', '') || ''),
    concurrency: Number(flag('concurrency', 3)) || 3
})
console.log('[runReprocessProductImages] Done')
process.exit(0)
