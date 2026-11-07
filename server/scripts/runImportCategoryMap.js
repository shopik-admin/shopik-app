/**
 * Replace the category tree + Comax sub-group map from a CSV.
 *
 * Usage:
 *   node server/scripts/runImportCategoryMap.js                 # repo copy
 *   node server/scripts/runImportCategoryMap.js path/to.csv
 *   node server/scripts/runImportCategoryMap.js --dry-run       # parse only
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import boot from '../boot.js'
import { applyCategoryMap, buildCategoryPlan } from '#server/services/categoryMap/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const fileArg = args.find(arg => !arg.startsWith('--'))
const file = fileArg ? path.resolve(fileArg) : path.join(__dirname, 'category-map.csv')

const csvText = fs.readFileSync(file, 'utf8')

if (dryRun) {
    const plan = buildCategoryPlan(csvText)
    console.log(`[category-map] dry run: ${file}`)
    console.log(`[category-map] categories ${plan.categories.length} ` +
        `(L1 ${plan.counts.l1}, L2 ${plan.counts.l2}, L3 ${plan.counts.l3}), ` +
        `mapped sub-groups ${plan.map.length}`)
    process.exit(0)
}

const { DL } = await boot()
console.log(`[category-map] Importing ${file}`)
const summary = await applyCategoryMap({ DL, csvText, filename: path.basename(file) })
console.log('[category-map] Done:', summary)
process.exit(0)
