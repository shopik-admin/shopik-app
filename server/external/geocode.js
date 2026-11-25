import { ADDRESS_GEOCODE_CHAIN, ADDRESS_PROVIDERS } from '#common/constants.js'
import { buildGeocodeKey, normalizeAddressParts } from './addressProvider/geocodeKey.js'
import { lookupGovmap, lookupGovmapText, normalizeAddressText } from './addressProvider/govmapApi.js'

const GOOGLE_MAPS_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const CACHE_MONTHS = { RANGE_INTERPOLATED: 3, STREET: 6 }
const GOOGLE_TIMEOUT_MS = () => Number(process.env.GOOGLE_TIMEOUT_MS) || 4500
const MAX_ANCHOR_M = () => Number(process.env.GOOGLE_ANCHOR_MAX_M) || 2000
const MAX_ANCHOR_WITHOUT_NUMBER_M = 400
const ANCHOR_BOUNDS_DELTA = 0.02

const LOCATION_TYPE_RANK = {
    ROOFTOP: 0,
    RANGE_INTERPOLATED: 1,
    GEOMETRIC_CENTER: 2,
    APPROXIMATE: 3
}

function hasComponent(result, type) {
    return (result.address_components || []).some(c => c.types?.includes(type))
}

function hasStreetComponent(result) {
    return hasComponent(result, 'route') || hasComponent(result, 'street_address')
}

function pickBestResult(results) {
    const streetLevel = results.filter(hasStreetComponent)
    const pool = streetLevel.length
        ? streetLevel
        : results.filter(r => !(r.types || []).includes('country'))
    if (!pool.length) return results[0]

    return pool.reduce((best, cur) => {
        const bestRank = LOCATION_TYPE_RANK[best.geometry?.location_type] ?? 9
        const curRank = LOCATION_TYPE_RANK[cur.geometry?.location_type] ?? 9
        if (curRank !== bestRank) return curRank < bestRank ? cur : best
        if (hasComponent(cur, 'street_number') !== hasComponent(best, 'street_number'))
            return hasComponent(cur, 'street_number') ? cur : best
        return best
    })
}

function isExpired(hit) {
    const months = CACHE_MONTHS[hit?.accuracy]
    if (!months) return false
    const at = new Date(hit.updatedAt || hit.createdAt)
    if (Number.isNaN(at.getTime())) return true
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    return at < cutoff
}

function componentName(components, type) {
    const component = (components || []).find(c => c?.types?.includes(type))
    return component?.long_name || component?.short_name || null
}

function distanceMeters(a, b) {
    if (!a || !b) return Infinity
    const [lng1, lat1] = a
    const [lng2, lat2] = b
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return Infinity
    const R = 6371000
    const toRad = deg => (deg * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(h))
}

function sameHouseNumber(actual, wanted) {
    const norm = value => String(value ?? '').replace(/\s+/g, '').toLowerCase()
    const a = norm(actual)
    const b = norm(wanted)
    if (!a || !b) return false
    if (a === b) return true
    const baseA = /^\d+/.exec(a)?.[0]
    const baseB = /^\d+/.exec(b)?.[0]
    return !!baseA && baseA === baseB
}

function samePlace(a, b) {
    const left = normalizeAddressText(a)
    const right = normalizeAddressText(b)
    if (!left || !right) return true
    return left === right || left.includes(right) || right.includes(left)
}

/**
 * A Google result is accepted only if it is precise AND anchored to the
 * GovMap street/city point. Without an anchor the result must be ROOFTOP and
 * its locality must match the selected city — this is what stops "stray to
 * another city" matches from being stored.
 */
export function isGoogleResultValid(result, { city, street, building, anchor } = {}) {
    if (!result?.location?.coordinates?.length) return false
    if (!['ROOFTOP', 'RANGE_INTERPOLATED'].includes(result.accuracy)) return false

    const point = result.location.coordinates
    if (anchor) {
        if (distanceMeters(point, anchor) > MAX_ANCHOR_M()) return false
    } else if (result.accuracy !== 'ROOFTOP') {
        return false
    }

    if (building) {
        const number = componentName(result.components, 'street_number')
        if (number) {
            if (!sameHouseNumber(number, building)) return false
        } else {
            if (!anchor) return false
            if (distanceMeters(point, anchor) > MAX_ANCHOR_WITHOUT_NUMBER_M) return false
        }
    }

    if (!anchor && city) {
        const locality = componentName(result.components, 'locality')
            || componentName(result.components, 'administrative_area_level_2')
            || componentName(result.components, 'sublocality')
        if (locality && !samePlace(locality, city)) return false
    }

    return true
}

function boundsAround(anchor) {
    const [lng, lat] = anchor
    const d = ANCHOR_BOUNDS_DELTA
    return `${lat - d},${lng - d}|${lat + d},${lng + d}`
}

async function fetchFromGoogle(address, { anchor } = {}) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey)
        throw new Error('Missing Google Maps API Key')

    const addressString = address.q?.trim()
        ? address.q.trim()
        : `${address.street} ${address.building}, ${address.city}`.replace(/\s+/g, ' ').trim()

    const params = new URLSearchParams({
        address: addressString,
        components: 'country:IL',
        language: 'he',
        region: 'il',
        key: apiKey
    })
    if (anchor?.length === 2) params.set('bounds', boundsAround(anchor))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS())
    let response
    try {
        response = await fetch(`${GOOGLE_MAPS_GEOCODE_URL}?${params}`, { signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }

    if (!response.ok)
        throw new Error(`Geocoding failed with status: ${response.status}`)

    const data = await response.json()

    if (data.status !== 'OK' || !data.results?.length)
        return address

    const result = pickBestResult(data.results)

    const { lat, lng } = result.geometry.location

    return {
        ...address,
        location: {
            type: 'Point',
            coordinates: [lng, lat]
        },
        accuracy: result.geometry.location_type,
        components: result.address_components,
        formattedAddress: result.formatted_address
    }
}

function geocodeChain() {
    const env = String(process.env.ADDRESS_GEOCODE_PROVIDER || ADDRESS_PROVIDERS.GOVMAP).toLowerCase()
    return ADDRESS_GEOCODE_CHAIN[env] || ADDRESS_GEOCODE_CHAIN[ADDRESS_PROVIDERS.GOVMAP]
}

async function readCache(DL, key) {
    if (!key || !DL?.GeocodeCache) return null
    try {
        const hit = await DL.GeocodeCache.readById(key)
        if (hit?.location?.coordinates?.length && !isExpired(hit)) return hit
    } catch { }
    return null
}

async function writeCache(DL, key, parts, result) {
    if (!key || !DL?.GeocodeCache || !result?.location?.coordinates?.length) return
    if (!['ROOFTOP', 'RANGE_INTERPOLATED', 'STREET'].includes(result.accuracy)) return
    try {
        const normalized = normalizeAddressParts(parts)
        await DL.GeocodeCache.updateOne({ id: key }, {
            id: key,
            ...normalized,
            building: normalized.building || '*',
            location: result.location,
            accuracy: result.accuracy,
            source: result.source
        }, { upsert: true })
    } catch (e) {
        console.warn('[geocode-cache] write failed', e?.message || e)
    }
}

async function geocodeWithGoogle(input, anchor) {
    try {
        const res = await fetchFromGoogle(input, { anchor })
        if (!res?.location) return null
        if (!isGoogleResultValid(res, { ...input, anchor })) return null
        return {
            ...input,
            location: res.location,
            accuracy: res.accuracy,
            source: 'google'
        }
    } catch (e) {
        console.warn('[google] geocode failed', e?.message || e)
        return null
    }
}

async function resolveFreeText({ q }) {
    const chain = geocodeChain()
    if (chain.includes(ADDRESS_PROVIDERS.GOVMAP)) {
        const govmap = await lookupGovmapText(q)
        if (govmap) return { q, ...govmap }
    }
    try {
        const res = await fetchFromGoogle({ q })
        if (!res?.location) return null
        return { q, location: res.location, accuracy: res.accuracy, source: 'google' }
    } catch (e) {
        console.warn('[google] geocode failed', e?.message || e)
        return null
    }
}

/**
 * One geocoding chain for every address consumer:
 *   cache → GovMap exact house → Google (anchored + validated) → GovMap street.
 * Returns null when no trustworthy point exists; callers must not store a guess.
 */
export async function resolveAddress({ DL, q, city, street, building } = {}) {
    const freeText = String(q || '').trim()
    if (freeText) return resolveFreeText({ q: freeText })

    const parts = {
        city: String(city || '').trim(),
        street: String(street || '').trim(),
        building: building === undefined || building === null ? '' : String(building).trim()
    }
    if (!parts.city || !parts.street) return null

    const key = buildGeocodeKey(parts)
    const cached = await readCache(DL, key)
    if (cached) {
        return {
            ...parts,
            location: cached.location,
            accuracy: cached.accuracy,
            source: cached.source || 'cache'
        }
    }

    const chain = geocodeChain()
    if (chain.includes(ADDRESS_PROVIDERS.GOVMAP)) {
        const govmap = await lookupGovmap(parts)

        if (govmap.address) {
            const result = { ...parts, ...govmap.address }
            await writeCache(DL, key, parts, result)
            return result
        }

        if (chain.includes(ADDRESS_PROVIDERS.GOOGLE)) {
            const anchor = govmap.streetPoint || govmap.cityPoint
            const google = await geocodeWithGoogle(parts, anchor)
            if (google) {
                await writeCache(DL, key, parts, google)
                return google
            }
        }

        if (govmap.streetPoint) {
            const streetLevel = {
                ...parts,
                location: { type: 'Point', coordinates: govmap.streetPoint },
                accuracy: 'STREET',
                source: 'govmap'
            }
            await writeCache(DL, key, parts, streetLevel)
            return streetLevel
        }

        return null
    }

    // Rollback / google-only mode keeps the legacy permissive behaviour.
    try {
        const res = await fetchFromGoogle(parts, {})
        if (!res?.location) return null
        const result = {
            ...parts,
            location: res.location,
            accuracy: res.accuracy,
            source: 'google'
        }
        await writeCache(DL, key, parts, result)
        return result
    } catch (e) {
        console.warn('[google] geocode failed', e?.message || e)
        return null
    }
}

function geocodeFactory({ DL }) {
    async function address(input) {
        return resolveAddress({ DL, ...(input || {}) })
    }

    return { address }
}

export default geocodeFactory
export { fetchFromGoogle }
