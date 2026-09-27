// City-borders publish pipeline (MOI jurisdiction boundaries as map overlay).
// The GeoJSON lives on the files CDN; only its relative path is stored,
// in a `file`-type setting (no redeploy on refresh).

export const CITY_BORDERS_KEY = 'cityBordersUrl'
export const CITY_BORDERS_CATEGORY = 'supply'
export const CITY_BORDERS_SUB_CATEGORY = 'map'

// Loose Israel bounds (wider than the map viewport — Eilat's tip sits at ~29.49).
const BBOX = { west: 34.1, south: 29.4, east: 36.0, north: 33.5 }
const MAX_FEATURES = 5000

function isValidPosition(p) {
    return Array.isArray(p)
        && typeof p[0] === 'number' && typeof p[1] === 'number'
        && Number.isFinite(p[0]) && Number.isFinite(p[1])
        && p[0] >= BBOX.west && p[0] <= BBOX.east
        && p[1] >= BBOX.south && p[1] <= BBOX.north
}

// Throws { status, message } on the first problem found.
export function validateCityBorders(fc) {
    if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features))
        throw { status: 400, message: 'invalid geojson: expected a FeatureCollection' }
    if (!fc.features.length || fc.features.length > MAX_FEATURES)
        throw { status: 400, message: `invalid geojson: expected 1-${MAX_FEATURES} features` }

    fc.features.forEach((f, i) => {
        const name = f?.properties?.name
        if (typeof name !== 'string' || !name.trim())
            throw { status: 400, message: `feature ${i}: missing properties.name` }
        const geom = f?.geometry
        if (geom?.type !== 'Polygon' && geom?.type !== 'MultiPolygon')
            throw { status: 400, message: `feature ${i} (${name}): geometry must be Polygon or MultiPolygon` }
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
        if (!Array.isArray(polys) || !polys.length)
            throw { status: 400, message: `feature ${i} (${name}): empty coordinates` }
        polys.forEach((poly, j) => {
            const outer = poly?.[0]
            if (!Array.isArray(outer) || outer.length < 4)
                throw { status: 400, message: `feature ${i} (${name}): ring ${j} has fewer than 4 positions` }
            const bad = outer.find(p => !isValidPosition(p))
            if (bad)
                throw { status: 400, message: `feature ${i} (${name}): coordinate out of range: [${bad}]` }
        })
    })

    return { features: fc.features.length }
}
