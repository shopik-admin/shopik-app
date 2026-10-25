/**
 * Per-department sale windows.
 *
 * The store feeds answer "can this store sell the item right now". This module
 * answers the stricter question "did it actually sell there recently": a
 * separate Comax call returns the last sale date per item per store, and a
 * store's in-stock mark is dropped when that date is older than the window of
 * the item's department.
 *
 * Days are per department, with one default for everything else:
 *   a department listed in a rule → that rule's days
 *   no rule                      → `defaultDays`
 *   `0` anywhere                 → never filtered (always kept)
 *
 * The stored value comes from the hidden `comax.salesWindow` setting; when it
 * is absent the 30-day default applies.
 */
export const SALES_WINDOW_KEY = 'comax.salesWindow'
export const DEFAULT_SALES_WINDOW_DAYS = 30
export const MAX_SALES_WINDOW_DAYS = 365

const DEPARTMENT_CODE = /^\d+$/

/**
 * Integer days, or `fallback` when the value is not acceptable.
 * 0 is valid and means "never filter this department".
 */
export function parseDays(raw, fallback = null) {
    if (raw == null || raw === '') return fallback
    const days = Number(raw)
    if (!Number.isInteger(days) || days < 0 || days > MAX_SALES_WINDOW_DAYS) return fallback
    return days
}

/**
 * Clean a stored/raw config. Never throws: a corrupt setting must not take the
 * nightly import down, so bad rules are dropped instead.
 * A department that appears twice keeps its first occurrence.
 */
export function normalizeSalesWindow(raw) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const defaultDays = parseDays(value.defaultDays, DEFAULT_SALES_WINDOW_DAYS)

    const seen = new Set()
    const rules = []
    for (const rule of Array.isArray(value.rules) ? value.rules : []) {
        const days = parseDays(rule?.days, null)
        if (days == null) continue

        const departments = []
        for (const code of Array.isArray(rule?.departments) ? rule.departments : []) {
            const key = String(code ?? '').trim()
            if (!DEPARTMENT_CODE.test(key) || seen.has(key)) continue
            seen.add(key)
            departments.push(key)
        }
        if (departments.length) rules.push({ days, departments })
    }

    return { defaultDays, rules }
}

/**
 * The run-time view: a department → days lookup plus the widest window, which
 * is the single `NumDaysSold` value sent to Comax (one call covers every
 * department, the per-department decision is made from LastSaleDate).
 */
export function buildDepartmentWindows(config) {
    const { defaultDays, rules } = normalizeSalesWindow(config)
    const byDepartment = new Map()
    let maxDays = defaultDays

    for (const rule of rules) {
        for (const code of rule.departments) byDepartment.set(code, rule.days)
        maxDays = Math.max(maxDays, rule.days)
    }

    return { defaultDays, byDepartment, maxDays }
}

export function daysForDepartment(windows, departmentCode) {
    const key = String(departmentCode ?? '').trim()
    if (key && windows?.byDepartment?.has(key)) return windows.byDepartment.get(key)
    return windows?.defaultDays ?? 0
}

/**
 * Was the item sold inside its window? `0` days means unfiltered, and an
 * unreadable date is treated as "sold" — the call only returns items that sold
 * inside `maxDays`, so keeping it is the safe side of the decision.
 */
export function isWithinWindow(lastSaleDate, days, now = new Date()) {
    if (!(days > 0)) return true
    if (!(lastSaleDate instanceof Date) || Number.isNaN(lastSaleDate.getTime())) return true
    return now.getTime() - lastSaleDate.getTime() <= days * 24 * 60 * 60 * 1000
}

/**
 * Turn one store's sales-window rows into the barcode set that keeps the
 * store's in-stock mark, plus the latest sale date per barcode (persisted for
 * debugging the decision).
 */
export function buildKeptBarcodes(rows, windows, now = new Date()) {
    const kept = new Set()
    const lastSale = new Map()
    let unknownDates = 0

    for (const row of rows || []) {
        const barcode = String(row?.barcode ?? '').trim()
        if (!barcode) continue

        if (row.lastSaleDate instanceof Date && !Number.isNaN(row.lastSaleDate.getTime())) {
            const previous = lastSale.get(barcode)
            if (!previous || row.lastSaleDate > previous) lastSale.set(barcode, row.lastSaleDate)
        } else {
            unknownDates++
        }

        if (isWithinWindow(row.lastSaleDate, daysForDepartment(windows, row.departmentCode), now))
            kept.add(barcode)
    }

    return { kept, lastSale, unknownDates }
}

/**
 * Strict validation for the admin endpoint (normalize drops bad input; this
 * rejects it). `knownDepartments` is the catalog's department code set.
 */
export function validateSalesWindowInput(payload, knownDepartments) {
    const defaultDays = payload?.defaultDays == null
        ? DEFAULT_SALES_WINDOW_DAYS
        : parseDays(payload.defaultDays, null)
    if (defaultDays == null)
        throw { status: 400, message: `defaultDays must be an integer between 0 and ${MAX_SALES_WINDOW_DAYS}` }

    const rawRules = payload?.rules
    if (rawRules != null && !Array.isArray(rawRules))
        throw { status: 400, message: 'rules must be an array' }

    const known = knownDepartments instanceof Set ? knownDepartments : new Set(knownDepartments || [])
    const seen = new Set()
    const rules = []

    for (const rule of rawRules || []) {
        const days = parseDays(rule?.days, null)
        if (days == null)
            throw { status: 400, message: `rule days must be an integer between 0 and ${MAX_SALES_WINDOW_DAYS}` }

        const departments = Array.isArray(rule?.departments) ? rule.departments : []
        if (!departments.length)
            throw { status: 400, message: 'every rule needs at least one department' }

        const codes = []
        for (const raw of departments) {
            const code = String(raw ?? '').trim()
            if (!DEPARTMENT_CODE.test(code))
                throw { status: 400, message: `invalid department code "${raw}"` }
            if (known.size && !known.has(code))
                throw { status: 400, message: `unknown department ${code}` }
            if (seen.has(code))
                throw { status: 400, message: `department ${code} is configured twice` }
            seen.add(code)
            codes.push(code)
        }
        rules.push({ days, departments: codes })
    }

    return { defaultDays, rules }
}

/**
 * The config in force for this run. A setting that cannot be read disables the
 * window instead of falling back to 30 — a removal step must fail safe.
 */
export async function resolveSalesWindow(DL) {
    if (!DL?.Setting?.readOne) return { defaultDays: 0, rules: [], enabled: false }

    let raw
    try {
        raw = (await DL.Setting.readOne({ key: SALES_WINDOW_KEY }, { _id: 0, value: 1 }))?.value
    } catch (e) {
        console.warn(`[Comax Import] Could not read ${SALES_WINDOW_KEY} — sales window disabled:`, e?.message || e)
        return { defaultDays: 0, rules: [], enabled: false }
    }

    const config = normalizeSalesWindow(raw)
    return { ...config, enabled: buildDepartmentWindows(config).maxDays > 0 }
}
