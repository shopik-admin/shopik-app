import boot from '../boot.js'
import { resolveRules } from '../services/comaxCategorySettings/index.js'

// One-off cleanup for settings rows created by the legacy category_map flag
// migration: it copied `showOnSite: true` / `requireKashrut: false` as explicit
// overrides on every row. A value equal to what the node inherits from its
// parent changes nothing, so removing it keeps behaviour identical and makes
// "מוגדר כאן" mean something again.
//
// Usage: node server/scripts/cleanupComaxCategoryFlagOverrides.js [--apply]
const apply = process.argv.includes('--apply')
const SETTING_KEYS = ['saleEnabled', 'saleDays', 'stockEnabled', 'minStock', 'hidden', 'requireKashrut']

const { DL } = await boot()
const rows = await DL.ComaxCategorySetting.read({}, { _id: 0 }, { limit: 0 })
const byPath = new Map((rows || []).map(row => [String(row.path), row]))

const updates = []
const deletes = []
const stats = { redundantHidden: 0, redundantKashrut: 0, keptIntentional: 0 }

for (const row of rows || []) {
    if (!row?.path || row.path === 'global') continue
    const segments = String(row.path).split('/')
    const parent = segments.slice(0, -1)
    const parentRule = resolveRules(byPath, {
        superDepartmentCode: parent[0],
        departmentCode: parent[1],
        groupCode: parent[2],
        subGroupCode: parent[3]
    })

    const unset = {}
    if (typeof row.hidden === 'boolean' && row.hidden === parentRule.hidden) {
        unset.hidden = ''
        stats.redundantHidden += 1
    }
    if (typeof row.requireKashrut === 'boolean' && row.requireKashrut === parentRule.requireKashrut) {
        unset.requireKashrut = ''
        stats.redundantKashrut += 1
    }
    if (!Object.keys(unset).length) {
        if (typeof row.hidden === 'boolean' || typeof row.requireKashrut === 'boolean')
            stats.keptIntentional += 1
        continue
    }

    const remaining = SETTING_KEYS.filter(key =>
        !(key in unset) && row[key] !== undefined && row[key] !== null
    )
    if (!remaining.length) deletes.push(row.path)
    else updates.push({ path: row.path, unset })
}

console.log(`settings rows: ${rows.length}`)
console.log(`redundant hidden flags: ${stats.redundantHidden}`)
console.log(`redundant requireKashrut flags: ${stats.redundantKashrut}`)
console.log(`rows to update: ${updates.length}, rows to delete (nothing left): ${deletes.length}`)
console.log(`meaningful hidden/kashrut overrides kept: ${stats.keptIntentional}`)
console.log('sample updates:', JSON.stringify(updates.slice(0, 5)))

if (!apply) {
    console.log('dry run — pass --apply to write')
    process.exit(0)
}

if (updates.length) {
    await DL.ComaxCategorySetting.Model.bulkWrite(updates.map(update => ({
        updateOne: {
            filter: { path: update.path },
            update: { $unset: update.unset }
        }
    })), { ordered: false })
}
if (deletes.length) {
    await DL.ComaxCategorySetting.Model.deleteMany({ path: { $in: deletes } })
}

console.log(`applied: ${updates.length} updated, ${deletes.length} deleted`)
process.exit(0)
