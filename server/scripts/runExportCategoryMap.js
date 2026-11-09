/**
 * Export the stored category tree + Comax sub-group map as a CSV that
 * runImportCategoryMap.js (or the admin upload) can read back unchanged.
 *
 * Usage:
 *   node server/scripts/runExportCategoryMap.js category-map-export.csv
 */
import fs from 'node:fs'
import path from 'node:path'
import boot from '../boot.js'
import { exportCategoryMap } from '#server/services/categoryMap/index.js'

const fileArg = process.argv.slice(2).find(arg => !arg.startsWith('--'))

if (!fileArg) {
    console.log('[category-map] usage: runExportCategoryMap.js <out.csv>')
    process.exit(1)
}

const file = path.resolve(fileArg)

const { DL } = await boot()
const { csv, counts } = await exportCategoryMap({ DL })

fs.writeFileSync(file, csv)
console.log(`[category-map] wrote ${file}:`, counts)
process.exit(0)
