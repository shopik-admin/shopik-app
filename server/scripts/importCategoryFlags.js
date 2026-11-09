import { readFileSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import boot from '../boot.js'
import { importCategoryFlags } from '../services/categoryMap/index.js'

// Load the Comax category-filter file (10 columns: the 8 catalog columns plus
// הצגת קטגוריה / חובה כשרות) onto category_map. It touches flags only — the
// tree and the sub-group assignments are left exactly as they are.
//
// Usage: node server/scripts/importCategoryFlags.js --file <file.csv>
//          [--dry-run] [--rollback <path.json>]
const args = process.argv.slice(2)
const flag = (name, def) => {
    const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`))
    if (i === -1) return def
    const eq = args[i].indexOf('=')
    if (eq !== -1) return args[i].slice(eq + 1)
    const next = args[i + 1]
    return next && !next.startsWith('--') ? next : true
}

const file = flag('file', '')
const dryRun = !!flag('dry-run', false)
const rollbackFile = flag('rollback', '')

if (!file) {
    console.error('Usage: node server/scripts/importCategoryFlags.js --file <file.csv> [--dry-run] [--rollback <path.json>]')
    process.exit(1)
}

const bootData = await boot()
const summary = await importCategoryFlags({
    DL: bootData.DL,
    csvText: readFileSync(file, 'utf8'),
    dryRun
})

console.log(`[categoryFlags] file: ${file}${dryRun ? ' (DRY RUN — no writes)' : ''}`)
console.log(`[categoryFlags] codes in file: ${summary.codes}`)
console.log(`[categoryFlags] changed: ${summary.pending}${dryRun ? '' : ` (written: ${summary.written})`}`)
console.log(`[categoryFlags] already matched: ${summary.unchanged}`)
console.log(`[categoryFlags] unknown to category_map: ${summary.unknown.length}${summary.unknown.length ? ` — ${summary.unknown.join(', ')}` : ''}`)
console.log(`[categoryFlags] skipped non-numeric rows: ${summary.skipped.length}`)
console.log(`[categoryFlags] map codes not in file (left untouched): ${summary.untouched.length}${summary.untouched.length ? ` — ${summary.untouched.join(', ')}` : ''}`)

if (!dryRun && summary.previous.length) {
    const rb = rollbackFile || path.join(os.tmpdir(), `category-flags-rollback-${Date.now()}.json`)
    writeFileSync(rb, JSON.stringify(summary.previous, null, 1))
    console.log(`[categoryFlags] rollback written: ${rb}`)
}

if (dryRun) console.log('[categoryFlags] DRY RUN — no writes')
process.exit(0)
