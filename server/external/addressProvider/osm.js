/**
 * OSM second fallback — free, ODbL.
 * Uses Photon (komoot) for prefix autocomplete, Nominatim for details.
 * Photon: https://photon.komoot.io/api/?q=&limit=&lang=he&bbox for IL
 * Keep as second fallback after govmap, before Google (cost saving).
 */

const PHOTON_URL = 'https://photon.komoot.io/api'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function searchOsm({ q, city, type = 'street', limit = 5 }) {
    if (!q) return []
    const query = type === 'city' ? q : `${q} ${city || ''}`.trim()

    try {
        const params = new URLSearchParams({
            q: query,
            limit: String(limit),
            lang: 'he',
            limit: String(limit)
        })
        // Bias to Israel bbox: 34.2,29.4,35.9,33.4
        params.set('bbox', '34.2,29.4,35.9,33.4')

        const res = await fetch(`${PHOTON_URL}?${params}`, {
            headers: { 'User-Agent': 'shopik-app/1.0 (address autocomplete)' }
        })
        if (!res.ok) return []
        const data = await res.json()
        const feats = (data.features || []).filter(f => {
            const c = f.properties?.countrycode === 'IL'
            if (type === 'city') return c && ['city', 'town', 'village'].includes(f.properties.osm_type || f.properties.type)
            return c
        })
        return feats.slice(0, limit).map(f => ({
            label: f.properties.name || f.properties.street || q,
            city: f.properties.city || city || '',
            street: f.properties.street || f.properties.name || '',
            building: f.properties.housenumber || '',
            location: f.geometry ? { type: 'Point', coordinates: f.geometry.coordinates } : undefined,
            place_id: f.properties.osm_id ? String(f.properties.osm_id) : undefined,
            source: 'osm',
            _raw: f.properties
        }))
    } catch (e) {
        console.warn('[osm] search failed', e.message)
        return []
    }
}
