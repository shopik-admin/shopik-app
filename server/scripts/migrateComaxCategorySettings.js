import boot from '../boot.js'
import {
    loadSettings,
    migrateCategoryMapFlags,
    migrateSalesWindowSettings
} from '../services/comaxCategorySettings/index.js'

// One-time move of the old settings into the Comax category settings tree:
//   comax.salesWindow          -> global + department sale rules
//   category_map.showOnSite    -> hidden
//   category_map.requireKashrut -> requireKashrut
//
// Safe to run again: writes are $setOnInsert / only fill missing fields, and
// the legacy fields are removed only after their values are stored.
//
// Deployment order matters: run this AFTER the new code is deployed. The old
// production code still reads showOnSite/requireKashrut until then.
const { DL } = await boot()

const sales = await migrateSalesWindowSettings(DL)
const flags = await migrateCategoryMapFlags(DL)
const settings = await loadSettings(DL)

console.log(`[migrateComaxCategorySettings] sales-window rows: ${sales.rows || 0}`)
console.log(`[migrateComaxCategorySettings] category flag rows: ${flags.rows || 0}`)
console.log(`[migrateComaxCategorySettings] ${settings.size} category setting row(s) available`)
process.exit(0)
