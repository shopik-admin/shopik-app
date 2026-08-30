export default async function read(payload, { DL }) {
    const { filter = {}, select, bounds, excludeIds } = payload

    const hasExcludeIds = Array.isArray(excludeIds) && excludeIds.length > 0
    const hasBounds = bounds && typeof bounds.north === 'number' && typeof bounds.south === 'number'
        && typeof bounds.east === 'number' && typeof bounds.west === 'number'

    // Viewport-optimized path: $geoIntersects against padded bounds polygon.
    // Bypass DL.read processFilter (which strips location) and hit the 2dsphere index directly.
    if (hasBounds) {
        const west = Math.max(-180, Math.min(180, bounds.west))
        const east = Math.max(-180, Math.min(180, bounds.east))
        const south = Math.max(-90, Math.min(90, bounds.south))
        const north = Math.max(-90, Math.min(90, bounds.north))
        const geometry = {
            type: 'Polygon',
            coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]]
        }
        const processedFilter = DL.SupplyArea.processFilter
            ? DL.SupplyArea.processFilter(filter, payload.search)
            : filter
        const query = { ...processedFilter, location: { $geoIntersects: { $geometry: geometry } } }
        if (hasExcludeIds) {
            const ids = excludeIds.filter(id => typeof id === 'string' && id.trim()).slice(0, 5000)
            if (ids.length) query.id = { $nin: ids }
        }
        const { skip = 0, limit = 30, sort, select: sel } = payload
        const finalSelect = sel || select
        let q = DL.SupplyArea.Model.find(query).lean()
        if (finalSelect) q = q.select(finalSelect)
        if (sort) q = q.sort(sort)
        if (skip) q = q.skip(Number(skip))
        if (limit) q = q.limit(Number(limit))
        return q
    }

    // Background paging without bounds but with excludeIds — use indexed $nin on id
    if (hasExcludeIds) {
        const ids = excludeIds.filter(id => typeof id === 'string' && id.trim()).slice(0, 5000)
        const processedFilter = DL.SupplyArea.processFilter
            ? DL.SupplyArea.processFilter(filter, payload.search)
            : filter
        const query = { ...processedFilter, id: { $nin: ids } }
        const { skip = 0, limit = 30, sort, select: sel } = payload
        const finalSelect = sel || select
        let q = DL.SupplyArea.Model.find(query).lean()
        if (finalSelect) q = q.select(finalSelect)
        if (sort) q = q.sort(sort)
        if (skip) q = q.skip(Number(skip))
        if (limit) q = q.limit(Number(limit))
        return q
    }

    return DL.SupplyArea.read(filter, select, payload)
}

read.config = {
    permissions: ['supply_area:read']
}