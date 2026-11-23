/**
 * In-memory city/street index for address autocomplete.
 *
 * Autocomplete used to run `distinct('city')` and an aggregate `$group` over
 * every street of the city on every keystroke. The data changes once a week, so
 * a per-process cache makes the hot path free: one indexed `find` per city per
 * TTL, then pure in-memory matching (0 Mongo operations).
 *
 * Memory is bounded by an LRU: `ADDRESS_CACHE_CITIES` cities (default 60) and
 * `ADDRESS_CACHE_TTL_MS` (default 10 minutes). Concurrent cold requests share
 * one in-flight promise so a burst cannot fan out into N identical queries.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000
const DEFAULT_MAX_CITIES = 30
const MAX_LIMIT = 20

export function normalizeSearch(value) {
    return String(value ?? '')
        .replace(/["'׳״]/g, '')
        .replace(/[-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

function toCityOption(city) {
    return { label: city, city, source: 'govmap' }
}

function toStreetOption(item, city) {
    const option = { label: item.street, city, street: item.street, source: 'govmap' }
    if (item.hint) option.hint = item.hint
    return option
}

export function createStreetIndex({
    Model,
    ttlMs = Number(process.env.ADDRESS_CACHE_TTL_MS) || DEFAULT_TTL_MS,
    maxCities = Number(process.env.ADDRESS_CACHE_CITIES) || DEFAULT_MAX_CITIES,
    clock = () => Date.now()
} = {}) {
    let cityList = null
    const cityListPending = { promise: null }
    const streetCache = new Map()
    const streetPending = new Map()

    function fresh(entry) {
        return entry && clock() - entry.at <= ttlMs
    }

    function touch(map, city, entry) {
        // Re-insert so the LRU evicts the least recently used city, not the
        // first one ever seen.
        map.delete(city)
        map.set(city, entry)
        while (map.size > maxCities) {
            const oldest = map.keys().next().value
            map.delete(oldest)
        }
        return entry
    }

    async function loadCities() {
        if (!Model) return []
        if (fresh(cityList)) return cityList.items
        if (cityListPending.promise) return cityListPending.promise
        cityListPending.promise = (async () => {
            try {
                const cities = await Model.distinct('city', { city: { $ne: null } })
                const items = (cities || [])
                    .filter(Boolean)
                    .map(String)
                    .sort((a, b) => a.localeCompare(b, 'he'))
                cityList = { items, at: clock() }
                return items
            } catch (e) {
                console.warn('[address-index] city load failed', e?.message || e)
                return cityList?.items || []
            } finally {
                cityListPending.promise = null
            }
        })()
        return cityListPending.promise
    }

    async function loadStreets(city) {
        if (!Model || !city) return []
        const cached = streetCache.get(city)
        if (fresh(cached)) return touch(streetCache, city, cached).items
        if (streetPending.has(city)) return streetPending.get(city)

        const promise = (async () => {
            try {
                const docs = await Model.find({ city })
                    .select({ _id: 0, street: 1, aliases: 1 })
                    .lean()
                const items = (docs || [])
                    .filter(doc => doc.street)
                    .map(doc => ({
                        street: doc.street,
                        norm: normalizeSearch(doc.street),
                        aliases: (doc.aliases || []).filter(Boolean),
                        aliasNorms: (doc.aliases || []).filter(Boolean).map(normalizeSearch)
                    }))
                    .sort((a, b) => a.street.localeCompare(b.street, 'he'))
                touch(streetCache, city, { items, at: clock() })
                return items
            } catch (e) {
                console.warn('[address-index] street load failed', e?.message || e)
                return []
            } finally {
                streetPending.delete(city)
            }
        })()

        streetPending.set(city, promise)
        return promise
    }

    function filterCities(items, query, limit) {
        const q = normalizeSearch(query)
        if (!q) return items.slice(0, limit).map(toCityOption)
        const prefix = []
        const contains = []
        for (const city of items) {
            const norm = normalizeSearch(city)
            if (norm.startsWith(q)) prefix.push(city)
            else if (norm.includes(q)) contains.push(city)
            if (prefix.length >= limit) break
        }
        return [...prefix, ...contains].slice(0, limit).map(toCityOption)
    }

    function filterStreets(items, query, limit, city) {
        const q = normalizeSearch(query)
        if (!q) return items.slice(0, limit).map(item => toStreetOption(item, city))

        const exact = []
        const prefix = []
        const aliasPrefix = []
        const contains = []
        const aliasContains = []

        for (const item of items) {
            if (item.norm === q) {
                exact.push(item)
                continue
            }
            if (item.norm.startsWith(q)) {
                prefix.push(item)
                continue
            }
            const aliasIndex = item.aliasNorms.findIndex(alias => alias.startsWith(q))
            if (aliasIndex !== -1) {
                aliasPrefix.push({ ...item, hint: item.aliases[aliasIndex] })
                continue
            }
            if (item.norm.includes(q)) {
                contains.push(item)
                continue
            }
            const containsIndex = item.aliasNorms.findIndex(alias => alias.includes(q))
            if (containsIndex !== -1)
                aliasContains.push({ ...item, hint: item.aliases[containsIndex] })
        }

        return [...exact, ...prefix, ...aliasPrefix, ...contains, ...aliasContains]
            .slice(0, limit)
            .map(item => toStreetOption(item, city))
    }

    return {
        async search({ q = '', type = 'street', city, limit = 10 } = {}) {
            const size = Math.max(1, Math.min(Number(limit) || 10, MAX_LIMIT))
            if (type === 'city') return filterCities(await loadCities(), q, size)
            if (!city) return []
            return filterStreets(await loadStreets(city), q, size, city)
        },
        clear() {
            cityList = null
            streetCache.clear()
            streetPending.clear()
        }
    }
}

let current = null

export function getStreetIndex(DL) {
    const Model = DL?.GovAddress?.Model
    if (!Model) return null
    if (!current || current.Model !== Model)
        current = { Model, index: createStreetIndex({ Model }) }
    return current.index
}

/** Called after a successful import so the next request reloads Mongo data. */
export function clearStreetIndexes() {
    current?.index.clear()
}
