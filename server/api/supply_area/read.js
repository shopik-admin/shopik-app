import rewind from '@turf/rewind'

function clampBounds(b) {
    return {
        west: Math.max(-180, Math.min(180, b.west)),
        east: Math.max(-180, Math.min(180, b.east)),
        south: Math.max(-90, Math.min(90, b.south)),
        north: Math.max(-90, Math.min(90, b.north))
    }
}
function boundsToRing(outer, inner) {
    const o = clampBounds(outer)
    const i = inner ? clampBounds(inner) : null
    const outerRing = [[o.west, o.south], [o.east, o.south], [o.east, o.north], [o.west, o.north], [o.west, o.south]]
    if (!i) return rewind({ type: 'Polygon', coordinates: [outerRing] })
    // Inset inner hole by tiny epsilon so it is strictly contained (Mongo rejects hole touching outer edge)
    const eps = 1e-7
    const innerRing = [
        [i.west + eps, i.south + eps],
        [i.east - eps, i.south + eps],
        [i.east - eps, i.north - eps],
        [i.west + eps, i.north - eps],
        [i.west + eps, i.south + eps]
    ]
    return rewind({ type: 'Polygon', coordinates: [outerRing, innerRing] })
}
const select = { _id: 0, name: 1, location: 1, stores: 1, id: 1 }
export default async function read(payload, { DL }) {
    const { filter = {}, bounds, ring } = payload

    const hasRing = ring && ring.outer && typeof ring.outer.north === 'number'
    const hasBounds = bounds && typeof bounds.north === 'number' && typeof bounds.south === 'number'
        && typeof bounds.east === 'number' && typeof bounds.west === 'number'

    if (hasRing) {
        const geometry = boundsToRing(ring.outer, ring.inner)
        const processedFilter = DL.SupplyArea.processFilter
            ? DL.SupplyArea.processFilter(filter, payload.search)
            : filter
        const query = { ...processedFilter, location: { $geoIntersects: { $geometry: geometry } } }
        const { skip = 0, limit = 30, sort, select: sel } = payload
        const finalSelect = sel || select
        let q = DL.SupplyArea.Model.find(query, select).lean()
        if (finalSelect) q = q.select(finalSelect)
        if (sort) q = q.sort(sort)
        if (skip) q = q.skip(Number(skip))
        if (limit) q = q.limit(Number(limit))
        return q
    }

    // Viewport-optimized path: $geoIntersects against padded bounds polygon.
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
        const { skip = 0, limit = 30, sort, select: sel } = payload
        const finalSelect = sel || select
        let q = DL.SupplyArea.Model.find(query, select).lean()
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