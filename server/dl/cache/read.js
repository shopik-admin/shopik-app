import handleSelect from '#server/dl/handleSelect.js'
import { CACHE_STRATEGIES } from '#common/constants.js'
import { parseArray } from '#common/functions/safeJsonParse.js'
import get from '#common/functions/get.js'

export default function (redis, Model) {
    function searchValue(doc, search) {
        if (!doc || typeof doc !== 'object') return false
        for (const field of Model.filterFields) {
            let actual = get(doc, field)

            if (typeof actual === 'string' && actual.toLowerCase().includes(search))
                return true
        }
        return false
    }

    function matchesFilter(doc, filter) {
        for (const [path, expected] of Object.entries(filter)) {
            if (!Model.filterFields.has(path)) continue // Whitelist enforcement
            if (path === '$or') {
                if (!expected.some(f => matchesFilter(doc, f))) return false
                continue
            }

            const actual = get(doc, path)

            if (Array.isArray(actual)) {
                if (expected instanceof RegExp) {
                    if (!actual.some(v => v != null && expected.test(String(v)))) return false
                } else if (!actual.includes(expected)) return false
                continue
            }

            if (expected instanceof RegExp) {
                if (actual == null || !expected.test(String(actual))) return false
            } else if (Array.isArray(expected.$in)) {
                if (!expected.$in.includes(actual)) return false
            } else if (actual !== expected) return false
        }
        return true
    }

    return async function read(filter = {}, select = { _id: 0 }, options = {}) {
        if (Model.cacheStrategy != CACHE_STRATEGIES.HASHSET) return null

        // If Redis is not connected, signal caller to fall back to MongoDB
        if (!redis || redis.status !== 'ready') return null

        let docsMap
        try {
            docsMap = await redis.hvals(Model.cacheName)
        } catch {
            return null
        }
        let docs = parseArray(docsMap)
        const { search, skip = 0, limit = 30, sort } = options

        const processedFilter = Model.processFilter(filter)
        const shouldFilter = Object.keys(processedFilter).length > 0

        docs = docs.filter(doc => {
            if (shouldFilter && !matchesFilter(doc, processedFilter)) return false
            if (search?.length && !searchValue(doc, search.toLowerCase())) return false
            return true
        })

        if (sort) {
            const entries = Object.entries(sort)
            docs.sort((a, b) => {
                for (const [path, direction] of entries) {
                    const av = get(a, path)
                    const bv = get(b, path)
                    if (av === bv) continue
                    if (av == null) return -direction
                    if (bv == null) return direction
                    if (av < bv) return -direction
                    if (av > bv) return direction
                }
                return 0
            })
        }

        if (skip > 0 || limit > 0)
            docs = docs.slice(skip, limit != null ? skip + limit : undefined)

        return handleSelect(docs, select)
    }
}