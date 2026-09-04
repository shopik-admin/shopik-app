export const DEFAULT_LIMITS = {
    minSum: 0,
    minSumPickup: 0,
    productMaxAmount: 0,
}

function normalizeLimits(raw) {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_LIMITS }
    return {
        minSum: Number(raw.minSum ?? DEFAULT_LIMITS.minSum) || 0,
        minSumPickup: Number(raw.minSumPickup ?? DEFAULT_LIMITS.minSumPickup) || 0,
        productMaxAmount: Number(raw.productMaxAmount ?? DEFAULT_LIMITS.productMaxAmount) || 0,
    }
}

export function extractLimits(settings) {
    if (!settings || typeof settings !== 'object') return { ...DEFAULT_LIMITS }
    // direct top-level: settings.limits
    if (settings.limits && typeof settings.limits === 'object' && ('minSum' in settings.limits || 'minSumPickup' in settings.limits || 'productMaxAmount' in settings.limits)) {
        return normalizeLimits(settings.limits)
    }
    // search categories (e.g. settings.system.limits or settings.order.limits)
    for (const cat of Object.values(settings)) {
        if (cat && typeof cat === 'object' && cat.limits && typeof cat.limits === 'object') {
            return normalizeLimits(cat.limits)
        }
        // also support nested subCategory flattened: system-order etc, but above loop covers
    }
    return { ...DEFAULT_LIMITS }
}

export function getMinSumForMethod(limits, deliveryMethod) {
    const isPickup = deliveryMethod === 'pickup'
    const raw = isPickup ? limits?.minSumPickup : limits?.minSum
    return Number(raw ?? 0) || 0
}

export function getRemainingToMin({ sum = 0, deliveryMethod = 'delivery', limits } = {}) {
    const threshold = getMinSumForMethod(limits, deliveryMethod)
    if (!threshold || threshold <= 0) return 0
    return Math.max(0, Math.round(threshold - Number(sum || 0)))
}

export function isBelowMin({ sum = 0, deliveryMethod = 'delivery', limits } = {}) {
    return getRemainingToMin({ sum, deliveryMethod, limits }) > 0
}

export function isAtMax(amount, productMaxAmount) {
    const max = Number(productMaxAmount ?? 0) || 0
    if (!max || max <= 0) return false
    return Number(amount ?? 0) >= max
}

export function isOverMax(amount, productMaxAmount) {
    const max = Number(productMaxAmount ?? 0) || 0
    if (!max || max <= 0) return false
    return Number(amount ?? 0) > max
}

export default extractLimits
