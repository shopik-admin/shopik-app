export default async function search(payload, { DL }) {
    const { value = '', filter, skip = 0, limit = 50, select } = payload

    let safeFilter
    if (filter && typeof filter === 'object' && !Array.isArray(filter)) {
        safeFilter = {}
        for (const [key, val] of Object.entries(filter)) {
            if (key.startsWith('$')) continue
            if (!DL.Product.filterFields?.has(key)) continue
            if (val === null || typeof val !== 'object') safeFilter[key] = val
        }
    }

    const cappedLimit = Math.min(Math.max(Number(limit) || 50, 1), 50)
    const cappedSkip = Math.min(Math.max(Number(skip) || 0, 0), 10000)

    return DL.Product.search(value, Object.keys(safeFilter || {}).length ? safeFilter : undefined, {
        skip: cappedSkip,
        limit: cappedLimit,
        select
    })
}

search.config = {
    auth: 'none'
}
