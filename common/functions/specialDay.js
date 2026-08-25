/**
 * Special-day closure semantics, shared by server enforcement and admin UI.
 *
 * A special day closes delivery windows for `date`:
 *  - all-day when `start` is null/undefined
 *  - partial [start, end) otherwise
 * Scope: storeId == null applies to ALL stores, otherwise just that store.
 */

export function overlapsWindow(sd, w) {
    if (sd.start == null) return true
    return w.start < sd.end && w.end > sd.start
}

export function sameScope(a, b) {
    return (a.storeId ?? null) === (b.storeId ?? null)
}

export function overlapsSpecialDay(a, b) {
    if (a.start == null || b.start == null) return true
    return a.start < b.end && a.end > b.start
}

/**
 * Builds Map<date, specialDay[]> from docs.
 */
export function buildSpecialMap(docs) {
    const map = new Map()
    for (const sd of docs || []) {
        if (!map.has(sd.date)) map.set(sd.date, [])
        map.get(sd.date).push(sd)
    }
    return map
}

/**
 * Returns active special days for a date that apply to the given storeId.
 */
export function specialDaysFor(specialMap, date, storeId) {
    return (specialMap.get(date) || []).filter(sd =>
        sd.storeId == null || sd.storeId === storeId
    )
}
