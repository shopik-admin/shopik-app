/**
 * Comax category rules: sale window, minimum stock and manual hide.
 *
 * The settings live per hierarchy node (see dl/schemas/comax_category_setting),
 * but the import and sync work per product. A product therefore resolves its
 * rule by walking its own path:
 *
 *   global -> superDepartment -> department -> group -> subGroup
 *
 * Every field inherits independently. An explicit false is an override, not a
 * missing value, so a sub-group can opt out of a gate its parent turned on.
 *
 * Sale and stock gates are kept separate on purpose:
 *   saleEnabled=false  -> keep the product regardless of when it last sold
 *   stockEnabled=false -> keep it regardless of stock (even at 0)
 *   both false         -> keep it in every active store
 */

export const GLOBAL_PATH = 'global'
const LEGACY_SALES_WINDOW_KEY = 'comax.salesWindow'

export const DEFAULT_SALE_DAYS = 30
export const DEFAULT_MIN_STOCK = 0

// Behaviour before any row is configured: the existing 30-day sale window and
// the normal "must be in stock" rule, but no minimum quantity.
export const BASE_RULES = Object.freeze({
    saleEnabled: true,
    saleDays: DEFAULT_SALE_DAYS,
    stockEnabled: true,
    minStock: DEFAULT_MIN_STOCK,
    hidden: false,
    requireKashrut: false
})

const LEVEL_DEPTH = {
    superDepartment: 1,
    department: 2,
    group: 3,
    subGroup: 4
}

const clean = value => (value == null ? '' : String(value).trim())

export function isGlobalPath(path) {
    return clean(path) === GLOBAL_PATH
}

/** Full hierarchy key for one level. */
export function pathFor(level, codes = {}) {
    if (level === 'global') return GLOBAL_PATH
    const depth = LEVEL_DEPTH[level]
    if (!depth) throw new Error(`unknown category level: ${level}`)
    return [
        codes.superDepartmentCode,
        codes.departmentCode,
        codes.groupCode,
        codes.subGroupCode
    ]
        .slice(0, depth)
        .map(clean)
        .join('/')
}

function codesOfComax(comax) {
    return {
        superDepartmentCode: comax?.superDepartmentCode,
        departmentCode: comax?.departmentCode,
        groupCode: comax?.groupCode,
        subGroupCode: comax?.subGroupCode
    }
}

/** The five keys a product's rule can come from, least specific first. */
export function pathsForComax(comax) {
    const codes = codesOfComax(comax)
    return [
        GLOBAL_PATH,
        pathFor('superDepartment', codes),
        pathFor('department', codes),
        pathFor('group', codes),
        pathFor('subGroup', codes)
    ]
}

const has = (row, field) => row?.[field] !== undefined && row?.[field] !== null

/**
 * Merge one stored row over the inherited rule. Only fields the row really
 * carries are applied, so an override of one field never freezes the others.
 */
function applyRow(rule, row) {
    if (!row) return rule
    const next = { ...rule }
    if (has(row, 'saleEnabled')) next.saleEnabled = row.saleEnabled === true
    if (has(row, 'saleDays')) next.saleDays = Number(row.saleDays)
    if (has(row, 'stockEnabled')) next.stockEnabled = row.stockEnabled === true
    if (has(row, 'minStock')) next.minStock = Number(row.minStock)
    if (has(row, 'hidden')) next.hidden = row.hidden === true
    if (has(row, 'requireKashrut')) next.requireKashrut = row.requireKashrut === true
    return next
}

/**
 * The effective rule for a set of hierarchy codes.
 * `settingsByPath` is the Map returned by loadSettings.
 */
export function resolveRules(settingsByPath, codes, base = BASE_RULES) {
    const { state, globalRule } = createRuleState(settingsByPath, base)
    let current = state

    const paths = [
        pathFor('superDepartment', codes),
        pathFor('department', codes),
        pathFor('group', codes),
        pathFor('subGroup', codes)
    ]

    for (const path of paths) current = stepRuleState(current, settingsByPath?.get(path))

    return finalizeRuleState(current, globalRule)
}

/**
 * Incremental counterpart of resolveRules for callers that walk a hierarchy
 * top-down (the category tree). One state per node instead of replaying the
 * whole global → super → department → group → subGroup chain per node.
 */
export function createRuleState(settingsByPath, base = BASE_RULES) {
    const globalRule = applyRow({ ...base }, settingsByPath?.get(GLOBAL_PATH))
    return {
        globalRule,
        state: { rule: { ...globalRule }, saleEnabledOwner: null, stockEnabledOwner: null }
    }
}

/** Merge one node's own row (rowKey may be undefined) into its parent state. */
export function stepRuleState(state, row) {
    if (!row) return state
    return {
        rule: applyRow(state.rule, row),
        saleEnabledOwner: has(row, 'saleEnabled') ? row : state.saleEnabledOwner,
        stockEnabledOwner: has(row, 'stockEnabled') ? row : state.stockEnabledOwner
    }
}

export function finalizeRuleState(state, globalRule) {
    let rule = state.rule
    const { saleEnabledOwner, stockEnabledOwner } = state

    // An enabled gate with an empty value takes the global default, not the
    // parent's value: the admin explicitly turned the gate on at this node.
    if (saleEnabledOwner?.saleEnabled === true && !has(saleEnabledOwner, 'saleDays'))
        rule = { ...rule, saleDays: globalRule.saleDays }
    if (stockEnabledOwner?.stockEnabled === true && !has(stockEnabledOwner, 'minStock'))
        rule = { ...rule, minStock: globalRule.minStock }

    // An enabled sale gate without an explicit window uses the global default.
    if (rule.saleEnabled !== false && !Number.isFinite(Number(rule.saleDays)))
        rule = { ...rule, saleDays: DEFAULT_SALE_DAYS }
    if (!Number.isFinite(Number(rule.minStock))) rule = { ...rule, minStock: DEFAULT_MIN_STOCK }

    return {
        saleEnabled: rule.saleEnabled !== false,
        saleDays: Math.max(0, Number(rule.saleDays) || 0),
        stockEnabled: rule.stockEnabled !== false,
        minStock: Math.max(0, Number(rule.minStock) || 0),
        hidden: rule.hidden === true,
        requireKashrut: rule.requireKashrut === true
    }
}

export function resolveRulesForComax(settingsByPath, comax, base) {
    return resolveRules(settingsByPath, codesOfComax(comax), base)
}

let migrationChecked = false
let categoryMapFlagsMigrationChecked = false

/**
 * One-time move of the old hidden `comax.salesWindow` setting into this
 * collection. Runs only when the new collection is empty, so an admin who
 * clears every row later does not get the old rules resurrected more than once
 * per process. `$setOnInsert` keeps it idempotent across processes.
 */
export async function migrateSalesWindowSettings(DL) {
    if (migrationChecked) return { migrated: false }
    migrationChecked = true
    if (!DL?.Setting?.readOne || !DL?.ComaxCategorySetting?.updateOne || !DL?.ComaxCategorySetting?.read)
        return { migrated: false }

    const existing = await DL.ComaxCategorySetting
        .read({}, { _id: 0, path: 1 }, { limit: 1 })
        .catch(() => [])
    if (existing?.length) return { migrated: false }

    let old
    try {
        old = (await DL.Setting.readOne({ key: 'comax.salesWindow' }, { _id: 0, value: 1 }))?.value
    } catch {
        return { migrated: false }
    }
    if (!old || typeof old !== 'object') return { migrated: false }

    const defaultDays = Number.isInteger(Number(old.defaultDays))
        ? Math.min(Math.max(Number(old.defaultDays), 0), 365)
        : DEFAULT_SALE_DAYS
    const docs = [{
        path: GLOBAL_PATH,
        level: 'global',
        saleEnabled: defaultDays > 0,
        ...(defaultDays > 0 ? { saleDays: defaultDays } : {})
    }]

    const rules = Array.isArray(old.rules) ? old.rules : []
    if (rules.length) {
        const paths = new Map() // department code -> Map(path -> metadata)
        const addPath = meta => {
            const code = meta.departmentCode
            if (!code) return
            if (!paths.has(code)) paths.set(code, new Map())
            const byPath = paths.get(code)
            if (!byPath.has(meta.path)) byPath.set(meta.path, meta)
        }

        if (DL?.CategoryMap?.read) {
            const maps = await DL.CategoryMap.read(
                {},
                {
                    _id: 0,
                    superDepartmentCode: 1,
                    superDepartment: 1,
                    departmentCode: 1,
                    department: 1
                },
                { limit: 0 }
            ).catch(() => [])
            for (const row of maps || []) {
                const code = clean(row.departmentCode)
                if (!code) continue
                addPath({
                    path: pathFor('department', {
                        superDepartmentCode: row.superDepartmentCode,
                        departmentCode: code
                    }),
                    superDepartmentCode: clean(row.superDepartmentCode) || null,
                    superDepartment: clean(row.superDepartment) || null,
                    departmentCode: code,
                    department: clean(row.department) || null
                })
            }
        }

        // A department whose products all left the category map can still have
        // an old rule; read the catalog for it before giving up on the rule.
        if (DL?.ComaxProduct?.Model?.aggregate) {
            const rows = await DL.ComaxProduct.Model.aggregate([
                { $match: { departmentCode: { $nin: [null, ''] } } },
                {
                    $group: {
                        _id: {
                            super: '$superDepartmentCode',
                            superName: '$superDepartment',
                            department: '$departmentCode',
                            departmentName: '$department'
                        }
                    }
                }
            ]).catch(() => [])
            for (const row of rows || []) {
                const code = clean(row?._id?.department)
                if (!code) continue
                addPath({
                    path: pathFor('department', {
                        superDepartmentCode: row?._id?.super,
                        departmentCode: code
                    }),
                    superDepartmentCode: clean(row?._id?.super) || null,
                    superDepartment: clean(row?._id?.superName) || null,
                    departmentCode: code,
                    department: clean(row?._id?.departmentName) || null
                })
            }
        }

        for (const rule of rules) {
            const rawDays = Number(rule?.days)
            if (!Number.isInteger(rawDays) || rawDays < 0) continue
            const days = Math.min(rawDays, 365)
            for (const code of rule?.departments || []) {
                for (const meta of paths.get(clean(code))?.values() || []) {
                    docs.push({
                        ...meta,
                        level: 'department',
                        saleEnabled: days > 0,
                        ...(days > 0 ? { saleDays: days } : {})
                    })
                }
            }
        }
    }

    for (const doc of docs) {
        try {
            await DL.ComaxCategorySetting.updateOne(
                { path: doc.path },
                { $setOnInsert: doc },
                { upsert: true }
            )
        } catch (e) {
            migrationChecked = false
            console.warn('[Comax Category Settings] Migration write failed:', e?.message || e)
            return { migrated: false, rows: 0 }
        }
    }

    console.log(`[Comax Category Settings] Migrated ${docs.length} sale-window row(s) from comax.salesWindow`)
    // The old setting must not resurrect the rules after an admin clears every
    // new row. If the delete fails the migration stays idempotent anyway.
    try {
        if (DL.Setting.deleteOne) await DL.Setting.deleteOne({ key: LEGACY_SALES_WINDOW_KEY })
        else await DL.Setting.Model?.deleteOne?.({ key: LEGACY_SALES_WINDOW_KEY })
    } catch (e) {
        console.warn('[Comax Category Settings] Could not delete the old sales-window setting:', e?.message || e)
    }
    return { migrated: true, rows: docs.length }
}

/**
 * Move the old category_map flags into the new per-sub-group settings.
 *
 * The old flags lived on the sub-group row and were the final word:
 *   showOnSite=false     -> hidden=true
 *   showOnSite=true      -> hidden=false
 *   requireKashrut=true  -> requireKashrut=true
 *   requireKashrut=false -> requireKashrut=false
 *
 * Existing explicit values (set by an admin through the new page) win and are
 * never overwritten. The old fields are removed from the documents only after
 * every write succeeded.
 */
export async function migrateCategoryMapFlags(DL) {
    if (categoryMapFlagsMigrationChecked) return { migrated: false }
    if (!DL?.CategoryMap?.Model?.collection || !DL?.ComaxCategorySetting?.read) return { migrated: false }

    let rows = []
    try {
        rows = await DL.CategoryMap.Model.collection
            .find({
                $or: [
                    { showOnSite: { $exists: true } },
                    { requireKashrut: { $exists: true } }
                ]
            })
            .project({
                _id: 0,
                subGroupCode: 1,
                superDepartmentCode: 1,
                superDepartment: 1,
                departmentCode: 1,
                department: 1,
                groupCode: 1,
                group: 1,
                subGroup: 1,
                showOnSite: 1,
                requireKashrut: 1
            })
            .toArray()
    } catch (e) {
        console.warn('[Comax Category Settings] category_map flags migration read failed:', e?.message || e)
        return { migrated: false }
    }

    if (!rows.length) {
        categoryMapFlagsMigrationChecked = true
        return { migrated: false }
    }

    const desiredByPath = new Map()
    for (const row of rows) {
        if (row?.subGroupCode == null) continue
        if (row.showOnSite === undefined && row.requireKashrut === undefined) continue
        const path = pathFor('subGroup', row)
        if (!path) continue

        const desired = desiredByPath.get(path) || {
            path,
            level: 'subGroup',
            superDepartmentCode: clean(row.superDepartmentCode) || null,
            departmentCode: clean(row.departmentCode) || null,
            groupCode: clean(row.groupCode) || null,
            subGroupCode: clean(row.subGroupCode) || null,
            superDepartment: clean(row.superDepartment) || null,
            department: clean(row.department) || null,
            group: clean(row.group) || null,
            subGroup: clean(row.subGroup) || null
        }
        // Only the non-default value is a real override. The legacy CSV stored
        // `showOnSite: true` / `requireKashrut: false` on every row; copying
        // those as explicit settings made every node "overridden here" and, far
        // worse, cancelled the new inheritance (a hidden parent no longer hid
        // its children).
        if (row.showOnSite === false) desired.hidden = true
        if (row.requireKashrut === true) desired.requireKashrut = true
        desiredByPath.set(path, desired)
    }

    const paths = [...desiredByPath.keys()]
    const existing = paths.length
        ? await DL.ComaxCategorySetting.read(
            { path: { $in: paths } },
            { _id: 0, path: 1, hidden: 1, requireKashrut: 1 },
            { limit: 0 }
        )
        : []
    const byPath = new Map((existing || []).map(row => [String(row.path), row]))

    const creates = []
    const updates = []
    for (const desired of desiredByPath.values()) {
        const current = byPath.get(desired.path)
        const set = {}
        // An explicit value from the new page is newer than the legacy flag.
        if (desired.hidden !== undefined && (current?.hidden === undefined || current?.hidden === null))
            set.hidden = desired.hidden
        if (desired.requireKashrut !== undefined &&
            (current?.requireKashrut === undefined || current?.requireKashrut === null))
            set.requireKashrut = desired.requireKashrut
        if (!Object.keys(set).length) continue

        if (current) {
            updates.push({ path: desired.path, ...set })
        } else {
            creates.push({
                path: desired.path,
                level: 'subGroup',
                superDepartmentCode: desired.superDepartmentCode,
                departmentCode: desired.departmentCode,
                groupCode: desired.groupCode,
                subGroupCode: desired.subGroupCode,
                superDepartment: desired.superDepartment,
                department: desired.department,
                group: desired.group,
                subGroup: desired.subGroup,
                ...set
            })
        }
    }

    if (updates.length) {
        await DL.ComaxCategorySetting.bulkWrite({
            docs: updates,
            getFilter: doc => ({ path: doc.path }),
            getUpsert: () => false,
            getUpdate: doc => {
                const { path: _path, ...fields } = doc
                return { $set: fields }
            }
        })
    }
    if (creates.length) {
        await DL.ComaxCategorySetting.bulkWrite({
            docs: creates,
            getFilter: doc => ({ path: doc.path }),
            getUpsert: () => true,
            getUpdate: doc => ({ $set: doc })
        })
    }

    // Only now that every flag is in the new collection are the old fields safe
    // to remove. The native collection bypasses the schema, which no longer
    // declares them.
    await DL.CategoryMap.Model.collection.updateMany(
        {
            $or: [
                { showOnSite: { $exists: true } },
                { requireKashrut: { $exists: true } }
            ]
        },
        { $unset: { showOnSite: '', requireKashrut: '' } }
    )
    categoryMapFlagsMigrationChecked = true
    console.log(`[Comax Category Settings] Migrated ${updates.length + creates.length} category_map flag(s) to settings`)
    return { migrated: true, rows: updates.length + creates.length }
}

/** Load the sparse override rows into a path -> row Map. */
export async function loadSettings(DL) {
    if (!DL?.ComaxCategorySetting?.read) return new Map()
    await migrateSalesWindowSettings(DL)
    await migrateCategoryMapFlags(DL)
    let rows
    try {
        rows = await DL.ComaxCategorySetting.read({}, { _id: 0 }, { limit: 0 })
    } catch (e) {
        console.warn('[Comax Category Settings] read failed — using defaults:', e?.message || e)
        return new Map()
    }
    const byPath = new Map()
    for (const row of rows || []) {
        if (!row?.path) continue
        byPath.set(String(row.path), row)
    }
    return byPath
}

/**
 * Resolve every known sub-group once. The import and sync run over the whole
 * catalog, so walking the five paths per product would repeat the same work.
 * Codes that have no category_map row are resolved lazily from the Comax row.
 */
export async function loadRuleLookup(DL) {
    const maps = DL?.CategoryMap?.read
        ? await DL.CategoryMap.read(
            {},
            {
                _id: 0,
                subGroupCode: 1,
                superDepartmentCode: 1,
                departmentCode: 1,
                groupCode: 1
            },
            { limit: 0 }
        ).catch(e => {
            console.warn('[Comax Category Settings] category map read failed:', e?.message || e)
            return []
        })
        : []
    const settingsByPath = await loadSettings(DL)

    const bySubGroupCode = new Map()
    for (const row of maps || []) {
        if (row?.subGroupCode == null) continue
        // A map row without the full Comax chain cannot resolve group/sub-group
        // overrides. Leave it out of the fast map so ruleFor() resolves from the
        // product's own codes instead of silently using a global-only rule.
        if (row.superDepartmentCode == null || row.departmentCode == null || row.groupCode == null)
            continue
        bySubGroupCode.set(
            String(row.subGroupCode),
            resolveRules(settingsByPath, row)
        )
    }

    return {
        bySubGroupCode,
        settingsByPath,
        ruleFor(comax) {
            const code = comax?.subGroupCode == null ? null : String(comax.subGroupCode)
            if (code && bySubGroupCode.has(code)) return bySubGroupCode.get(code)
            return resolveRulesForComax(settingsByPath, comax)
        }
    }
}

/** Store ids that count as "active" for the site. */
export async function readActiveStoreIds(DL) {
    try {
        const ids = await DL.CashRegister.Model.distinct('storeId', { active: true })
        const cleanIds = (ids || []).map(String).filter(Boolean)
        if (cleanIds.length) return [...new Set(cleanIds)]
    } catch {
        // Fall through to the Store collection.
    }

    try {
        const ids = await DL.Store.Model.distinct('id', { active: { $ne: false } })
        return [...new Set((ids || []).map(String).filter(Boolean))]
    } catch {
        return []
    }
}

const unique = values => [...new Set((values || []).map(String).filter(Boolean))]

/**
 * Apply both gates to one product's physical stock.
 *
 * `comax.storeIds` is the raw "in stock here" set written by the feeds.
 * `stockByStore` is the per-store balance (missing = not tracked, so pass).
 * `saleStoreIds` / `saleCheckedStores` are written by the sale-window step.
 *
 * A store is sellable only when both gates pass:
 *   stock gate off  -> every active store passes
 *   sale gate off   -> every active store passes
 *   both off        -> every active store (a zero-stock product stays visible)
 *
 * Returns null when the Comax row never tracked stock, so callers can keep the
 * product's stored value instead of wiping it.
 */
export function effectiveStoreIds(comax, rule, activeStoreIds = null) {
    const physical = Array.isArray(comax?.storeIds) ? unique(comax.storeIds) : null
    // Never tracked: keep whatever the Product already stored instead of
    // inventing availability from a rule.
    if (!physical) return null
    const active = unique(activeStoreIds)
    const universe = active.length ? active : physical

    if (!rule) return universe.filter(id => physical.includes(id))

    let stockStores
    if (rule.stockEnabled === false) {
        stockStores = universe
    } else {
        const balances = comax?.stockByStore && typeof comax.stockByStore === 'object'
            ? comax.stockByStore
            : {}
        const minStock = Number(rule.minStock) || 0
        stockStores = physical.filter(storeId => {
            const raw = balances[storeId]
            // Unknown balance (fresh counter, a feed missing a row) is not a
            // reason to hide the product.
            if (raw == null) return true
            return Number(raw) >= minStock
        })
    }

    let saleStores
    if (rule.saleEnabled === false || !(Number(rule.saleDays) > 0)) {
        saleStores = universe
    } else {
        // A store in saleCheckedStores but not in saleStoreIds was checked and
        // did not sell. A store in neither was not checked (incomplete feed),
        // so it fails open. An absent saleStoreIds is therefore an empty set,
        // not "unknown" — saleCheckedStores is what carries the knowledge.
        const sold = Array.isArray(comax?.saleStoreIds) ? unique(comax.saleStoreIds) : []
        const checked = Array.isArray(comax?.saleCheckedStores) ? unique(comax.saleCheckedStores) : []
        saleStores = universe.filter(storeId => !checked.includes(storeId) || sold.includes(storeId))
    }

    const stockSet = new Set(stockStores)
    return universe.filter(storeId => stockSet.has(storeId) && saleStores.includes(storeId))
}

/** Convenience for callers that only need to know whether stock passed. */
export function stockPasses(balance, minStock) {
    if (balance == null) return true
    return Number(balance) >= (Number(minStock) || 0)
}

export default {
    GLOBAL_PATH,
    DEFAULT_SALE_DAYS,
    DEFAULT_MIN_STOCK,
    BASE_RULES,
    pathFor,
    pathsForComax,
    resolveRules,
    resolveRulesForComax,
    loadSettings,
    loadRuleLookup,
    migrateSalesWindowSettings,
    migrateCategoryMapFlags,
    readActiveStoreIds,
    effectiveStoreIds,
    stockPasses
}
