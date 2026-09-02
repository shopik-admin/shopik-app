let _cache = {}

export function setSalesCache(map) {
    if (!map || typeof map !== 'object') return
    for (const k of Object.keys(map)) {
        if (map[k]) _cache[k] = map[k]
    }
}

export function getSalesCache() {
    return _cache
}

export function mergeSalesCache(map) {
    return setSalesCache(map)
}

export function clearSalesCache() {
    _cache = {}
}

export default {
    setSalesCache,
    getSalesCache,
    mergeSalesCache,
    clearSalesCache
}
