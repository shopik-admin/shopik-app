import rewind from '@turf/rewind'
import intersect from '@turf/intersect'
import area from '@turf/area'

// Below this area (sq-degrees) an intersection is considered a boundary touch
// (shared edge / shared vertex), which is allowed for seamless tiling.
const MIN_OVERLAP_AREA = 1e-9

// Normalize polygon: close every ring + enforce Right-Hand Rule (CCW exterior,
// CW holes) for MongoDB. Uses turf rewind default direction (no reverse flag).
export function normalizePolygon(location) {
    const rings = location.coordinates.map(ring => {
        const first = ring[0]
        const last = ring[ring.length - 1]

        if (!first || !last || first[0] !== last[0] || first[1] !== last[1])
            return [...ring, [...first]]

        return [...ring]
    })

    return rewind({ type: 'Polygon', coordinates: rings })
}

// Validate polygon structure and coordinate ranges
export function validatePolygon(location) {
    if (!location || location.type !== 'Polygon')
        throw { status: 400, message: 'Invalid geometry type. Must be Polygon.' }

    const rings = location.coordinates
    if (!Array.isArray(rings) || !rings.length)
        throw { status: 400, message: 'Polygon coordinates missing.' }

    for (const ring of rings) {
        if (!Array.isArray(ring) || ring.length < 4)
            throw { status: 400, message: 'Polygon must have at least 3 unique vertices.' }

        const unique = new Set(ring.map(([lng, lat]) => `${lng},${lat}`))
        if (unique.size < 3)
            throw { status: 400, message: 'Polygon must have at least 3 unique vertices.' }

        for (const [lng, lat] of ring) {
            if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                throw { status: 400, message: `Invalid coordinate pair: [${lng}, ${lat}]` }
            }
        }
    }
}

// Overlap check: MongoDB $geoIntersects filter + precise intersection area test.
// Uses @turf/intersect + @turf/area because @turf/boolean-overlap incorrectly
// returns true for polygons that only share a border (breaking seamless tiling).
// Uses the raw model directly to bypass DL processFilter (which strips non-filter
// fields) and to avoid the default read() limit of 30 docs.
export async function validateNoOverlap(DL, location, excludeId) {
    const query = {
        location: {
            $geoIntersects: { $geometry: location }
        }
    }

    if (excludeId)
        query.id = { $ne: excludeId }

    const candidates = await DL.SupplyArea.Model.find(query).select('id name location').lean()

    for (const candidate of candidates) {
        if (polygonsOverlap(location, candidate.location)) {
            throw { status: 400, message: `Supply area overlaps with existing area: "${candidate.name}"` }
        }
    }
}

function polygonsOverlap(geomA, geomB) {
    const intersection = intersect({
        type: 'FeatureCollection',
        features: [
            { type: 'Feature', properties: {}, geometry: geomA },
            { type: 'Feature', properties: {}, geometry: geomB }
        ]
    })

    return !!intersection && area(intersection) > MIN_OVERLAP_AREA
}

// Point-in-polygon lookup for address routing
export async function findByLocation(DL, point) {
    if (!point || point.type !== 'Point' || !Array.isArray(point.coordinates) || point.coordinates.length !== 2)
        return null

    const [lng, lat] = point.coordinates
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90)
        return null

    return await DL.SupplyArea.readOne({ location: { $geoIntersects: { $geometry: point } } })
}