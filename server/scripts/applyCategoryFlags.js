import { writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import boot from '../boot.js'
import { applyCategoryFlagStatuses } from '../services/categoryMap/index.js'
import { invalidateMenu } from '../utils/data/getMenu.js'
import { scanDel } from '../utils/data/displayBlocks.js'

// Apply the category_map flags already stored in the DB to today's catalog:
// hide ACTIVE products in a "show on site = false" sub-group and ACTIVE products
// in a "kashrut required" sub-group that lack a valid rabbinate code.
// With --unhide, HIDDEN products are re-derived through the full status ladder
// too, which reconciles the catalog with the flags of an earlier upload instead of
// waiting for the nightly sync.
//
// Usage: node server/scripts/applyCategoryFlags.js [--dry-run] [--limit N]
//          [--unhide] [--rollback <path.json>]
const args = process.argv.slice(2)
const flag = (name, def) => {
    const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`))
    if (i === -1) return def
    const eq = args[i].indexOf('=')
    if (eq !== -1) return args[i].slice(eq + 1)
    const next = args[i + 1]
    return next && !next.startsWith('--') ? next : true
}

const dryRun = !!flag('dry-run', false)
const limit = Number(flag('limit', 0)) || 0
const unhide = !!flag('unhide', false)
const rollbackFile = flag('rollback', '')

const bootData = await boot()
const summary = await applyCategoryFlagStatuses({
    DL: bootData.DL,
    dryRun,
    limit,
    relaxCodes: unhide ? 'all' : null
})

console.log(`[categoryFlags] active products: ${summary.products}${dryRun ? ' (DRY RUN — no writes)' : ''}`)
console.log(`[categoryFlags] hidden by category flag: ${summary.reasons.category}`)
console.log(`[categoryFlags] hidden by kashrut rule: ${summary.reasons.kashrut}`)
console.log(`[categoryFlags] hidden by both: ${summary.reasons.both}`)
console.log(`[categoryFlags] to hide: ${summary.hidden}`)
if (unhide) {
    console.log(`[categoryFlags] hidden products checked: ${summary.unhideCandidates}`)
    console.log(`[categoryFlags] to unhide (full ladder allows it): ${summary.unhideAllowed}${summary.unhideAllowed !== summary.unhidden ? ` — writes limited to ${summary.unhidden}` : ''}`)
    console.log(`[categoryFlags] left hidden: no comax row ${summary.unhideSkipped.noComax}, out of sync scope ${summary.unhideSkipped.outOfScope}, ladder ${summary.unhideSkipped.ladder}`)
}
console.log(`[categoryFlags] total writes: ${summary.toWrite}`)

if (!dryRun && summary.updates.length) {
    const rb = rollbackFile || path.join(os.tmpdir(), `category-flags-status-rollback-${Date.now()}.json`)
    writeFileSync(rb, JSON.stringify(summary.updates, null, 1))
    console.log(`[categoryFlags] rollback written: ${rb}`)

    await invalidateMenu({ DL: bootData.DL })
    console.log('[categoryFlags] menu cache invalidated')

    if (bootData.DL.redis) {
        const purged = await scanDel(bootData.DL.redis, 'display:*')
        console.log(`[categoryFlags] display cache keys purged: ${purged}`)
    }
}

if (dryRun) console.log('[categoryFlags] DRY RUN — no writes')
process.exit(0)
