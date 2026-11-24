import { pathFor } from '#server/services/comaxCategorySettings/index.js'
import { clearCategoryTreeCache } from '#server/services/comaxCategorySettings/tree.js'
import { recomputeCategoryProducts } from '#server/services/comaxCategorySettings/recompute.js'

const LEVELS = new Set(['global', 'superDepartment', 'department', 'group', 'subGroup'])
const MAX_SALE_DAYS = 365
const MAX_MIN_STOCK = 1_000_000

const clean = value => (value == null ? '' : String(value).trim())

function booleanField(payload, key, set, unset) {
    if (!(key in payload)) return
    if (payload[key] === null || payload[key] === undefined || payload[key] === '') unset[key] = ''
    else set[key] = payload[key] === true || payload[key] === 'true' || payload[key] === 1
}

function numberField(payload, key, set, unset, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = true, label }) {
    if (!(key in payload)) return
    const raw = payload[key]
    if (raw === null || raw === undefined || raw === '') {
        unset[key] = ''
        return
    }
    const value = Number(raw)
    if (
        !Number.isFinite(value) ||
        value < min ||
        value > max ||
        (integer && !Number.isInteger(value))
    )
        throw {
            status: 400,
            message: `${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`
        }
    set[key] = value
}

export default async function update(payload, { DL }) {
    const level = clean(payload?.level) || 'global'
    if (!LEVELS.has(level)) throw { status: 400, message: `invalid level: ${level}` }

    const codes = {
        superDepartmentCode: clean(payload?.superDepartmentCode),
        departmentCode: clean(payload?.departmentCode),
        groupCode: clean(payload?.groupCode),
        subGroupCode: clean(payload?.subGroupCode)
    }
    const path = level === 'global' ? 'global' : pathFor(level, codes)
    if (!path) throw { status: 400, message: 'category path required' }
    if (payload?.path && clean(payload.path) !== path)
        throw { status: 400, message: 'path does not match the category codes' }

    const set = {}
    const unset = {}

    booleanField(payload, 'saleEnabled', set, unset)
    numberField(payload, 'saleDays', set, unset, {
        min: 0,
        max: MAX_SALE_DAYS,
        integer: true,
        label: 'saleDays'
    })
    booleanField(payload, 'stockEnabled', set, unset)
    numberField(payload, 'minStock', set, unset, {
        min: 0,
        max: MAX_MIN_STOCK,
        integer: false,
        label: 'minStock'
    })
    booleanField(payload, 'hidden', set, unset)
    booleanField(payload, 'requireKashrut', set, unset)

    // A disabled gate does not need a value; clearing it makes the inheritance
    // rule obvious when the gate is switched back on.
    if (set.saleEnabled === false) unset.saleDays = ''
    if (set.stockEnabled === false) unset.minStock = ''

    const hasChanges = Object.keys(set).length > 0 || Object.keys(unset).length > 0
    const settingKeys = ['saleEnabled', 'saleDays', 'stockEnabled', 'minStock', 'hidden', 'requireKashrut']
    const existing = await DL.ComaxCategorySetting.readOne(
        { path },
        {
            _id: 0,
            path: 1,
            saleEnabled: 1,
            saleDays: 1,
            stockEnabled: 1,
            minStock: 1,
            hidden: 1
        }
    )
    const willHaveSettings = settingKeys.some(key => {
        if (key in set) return true
        if (key in unset) return false
        return existing?.[key] !== undefined && existing?.[key] !== null
    })

    if (!willHaveSettings) {
        // Every field is inherited: an empty row would only show up as a
        // phantom override in the tree.
        if (existing) await DL.ComaxCategorySetting.Model.deleteOne({ path })
    } else if (hasChanges) {
        const metadata = {
            path,
            level,
            superDepartmentCode: codes.superDepartmentCode || null,
            departmentCode: codes.departmentCode || null,
            groupCode: codes.groupCode || null,
            subGroupCode: codes.subGroupCode || null,
            superDepartment: clean(payload?.superDepartment) || null,
            department: clean(payload?.department) || null,
            group: clean(payload?.group) || null,
            subGroup: clean(payload?.subGroup) || null
        }
        if (existing) {
            await DL.ComaxCategorySetting.updateOne(
                { path },
                {
                    $set: { ...metadata, ...set },
                    ...(Object.keys(unset).length ? { $unset: unset } : {})
                }
            )
        } else {
            await DL.ComaxCategorySetting.create({ ...metadata, ...set })
        }
    }

    const recomputeGates = ['saleEnabled', 'stockEnabled', 'minStock', 'hidden', 'requireKashrut']
    const needsRecompute = !willHaveSettings ||
        recomputeGates.some(key => key in set || key in unset)
    let recompute = { products: 0, updated: 0, hidden: 0, unhidden: 0, stockChanged: 0 }
    let recomputeError = null
    if (needsRecompute) {
        try {
            recompute = await recomputeCategoryProducts({ DL, path })
        } catch (e) {
            recomputeError = e?.message || String(e)
            console.warn('[Comax Category Settings] recompute failed:', recomputeError)
        }
    }

    // The tree page refetches right after saving; rebuild instead of returning
    // the pre-save rules/counts.
    clearCategoryTreeCache(DL)

    return {
        ok: true,
        path,
        level,
        cleared: !willHaveSettings,
        ...(recomputeError ? { recomputeError } : {}),
        ...recompute
    }
}

update.config = {
    permissions: ['comax_product:update'],
    preventMultiple: true
}
