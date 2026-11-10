import boot from '../boot.js'
import gs1AliasReport from './gs1AliasReport.js'

// Dry-run: resolve GS1 long barcodes against short Product barcodes and write a
// CSV for review. No DB writes, no GS1 calls.
// Usage: node server/scripts/runGs1AliasReport.js [--out <file.csv>]
//          [--limit N] [--page N] [--only non-exact|all|alias|ambiguous|none]
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
console.log('[runGs1AliasReport] Boot done, scanning...')
await gs1AliasReport(bootData, {
    out: String(flag('out', '')),
    limit: Number(flag('limit', 0)) || 0,
    page: Number(flag('page', 0)) || 0,
    only: String(flag('only', 'non-exact'))
})
console.log('[runGs1AliasReport] Done')
process.exit(0)
