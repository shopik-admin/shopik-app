/**
 * GovMap live search (the geocoder behind govmap.gov.il).
 *
 * The local GovAddress DB has city+street names but no house numbers and no
 * coordinates. This provider asks the same national registry the user picked
 * the street from, so an alias ("בן זכאי") resolves to its official street
 * ("יוחנן בן זכאי") and the returned point is in the city that was selected.
 *
 * Response shape:
 *   { results: [{ id, text, originalText?, type, shape: 'POINT(x y)' }] }
 * `shape` is WKT in EPSG:3857 (Web Mercator), converted to [lng, lat] here.
 *
 * The endpoint is the one the GovMap site itself calls. GOVMAP_API_KEY is sent
 * when configured (official registration); the search service currently answers
 * without it. Every failure degrades to [] so Google can act as the fallback.
 */

const DEFAULT_URL = 'https://www.govmap.gov.il/api/search-service/autocomplete'
const BREAKER_THRESHOLD = 5
const BREAKER_COOLDOWN_MS = 2 * 60 * 1000
const CITY_TTL_MS = 24 * 60 * 60 * 1000
const WARN_INTERVAL_MS = 60 * 1000

const cityCache = new Map()
let failures = 0
let openUntil = 0
let lastWarnAt = 0

function searchUrl() {
    return process.env.GOVMAP_SEARCH_URL || DEFAULT_URL
}

function timeoutMs() {
    return Number(process.env.GOVMAP_TIMEOUT_MS) || 2500
}

function warn(message) {
    const now = Date.now()
    if (now - lastWarnAt < WARN_INTERVAL_MS) return
    lastWarnAt = now
    console.warn('[govmap-api]', message)
}

/** Inverse Web Mercator (EPSG:3857 → WGS84 [lng, lat]). */
export function webMercatorToWgs84(x, y) {
    const R = 6378137
    const lng = (x / R) * (180 / Math.PI)
    const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)
    return [lng, lat]
}

export function normalizeAddressText(value) {
    return String(value ?? '')
        .replace(/["'׳״]/g, '')
        .replace(/[.,\-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

export function parseShapePoint(shape) {
    const match = /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i
        .exec(String(shape || '').trim())
    if (!match) return null
    const x = Number(match[1])
    const y = Number(match[2])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    const point = webMercatorToWgs84(x, y)
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null
    if (point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) return null
    return point
}

export function houseNumberMatches(text, building) {
    const wanted = normalizeAddressText(building)
    if (!wanted) return false
    if (/^\d+$/.test(wanted))
        return new RegExp(`(?:^|\\s)${wanted}(?:[א-ת]|/\\d+)?(?:\\s|$)`).test(text)
    return new RegExp(`(?:^|\\s)${escapeRegex(wanted)}(?:\\s|$)`).test(text)
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Picks the one address result that belongs to the requested city and house
 * number. A result whose street text does not match is allowed only when it is
 * the single candidate (the local street may be an alias of the official name).
 */
export function pickAddressResult(results, { city, street, building }) {
    const cityN = normalizeAddressText(city)
    const streetN = normalizeAddressText(street)
    const strong = []
    const weak = []

    for (const result of results || []) {
        if (result?.type !== 'address') continue
        const point = parseShapePoint(result.shape)
        if (!point) continue
        const fields = [result.text, result.originalText]
            .map(normalizeAddressText)
            .filter(Boolean)
        // The city is the suffix of a full address ("... 3 ביתר עילית"). A bare
        // `includes` would also accept a street named Jerusalem in Tel Aviv.
        if (cityN && !fields.some(field => field.endsWith(cityN))) continue
        if (!fields.some(field => houseNumberMatches(field, building))) continue
        const entry = { result, point }
        if (streetN && fields.some(field => field.includes(streetN))) strong.push(entry)
        else weak.push(entry)
    }

    if (strong.length) return strong[0]
    if (weak.length === 1) return weak[0]
    return null
}

/** Low-level search. Returns [] on any failure (never throws). */
export async function searchGovmapLive(params = {}) {
    if (Date.now() < openUntil) return []

    const apiKey = process.env.GOVMAP_API_KEY
    const body = {
        searchText: String(params.searchText || '').trim(),
        language: 'he',
        isAccurate: false,
        maxResults: Number(params.maxResults) || 8
    }
    if (!body.searchText) return []
    if (params.filterType) body.filterType = params.filterType
    if (apiKey) body.apiKey = apiKey

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs())
    try {
        const res = await fetch(searchUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // The public search endpoint answers 403 to obvious bot UAs.
                // Kept honest (compatible; contact URL) instead of spoofing Chrome.
                'User-Agent': 'Mozilla/5.0 (compatible; ShopikAddress/1.0; +https://shopik.co.il)'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = await res.json()
        failures = 0
        return Array.isArray(data?.results) ? data.results : []
    } catch (e) {
        failures += 1
        if (failures >= BREAKER_THRESHOLD) {
            openUntil = Date.now() + BREAKER_COOLDOWN_MS
            failures = 0
            warn(`circuit open for ${BREAKER_COOLDOWN_MS / 1000}s after repeated failures`)
        }
        warn(e?.message || e)
        return []
    } finally {
        clearTimeout(timer)
    }
}

function pickStreetPoint(results, city) {
    const cityN = normalizeAddressText(city)
    const streets = (results || []).filter(r => r?.type === 'street' && parseShapePoint(r.shape))
    if (streets.length) {
        const inCity = cityN
            ? streets.find(r => normalizeAddressText(r.text).endsWith(cityN))
            : null
        return parseShapePoint((inCity || streets[0]).shape)
    }
    // No street geometry: an address on the street is still a city-local anchor.
    const addresses = (results || []).filter(r => r?.type === 'address' && parseShapePoint(r.shape))
    const inCity = cityN
        ? addresses.find(r => normalizeAddressText(r.text).endsWith(cityN))
        : null
    const address = inCity || addresses[0]
    return address ? parseShapePoint(address.shape) : null
}

function pickSettlementPoint(results, city) {
    const cityN = normalizeAddressText(city)
    const settlements = (results || []).filter(r => r?.type === 'settlement' && parseShapePoint(r.shape))
    if (!settlements.length) return null
    const exact = settlements.find(r => normalizeAddressText(r.text) === cityN)
    return parseShapePoint((exact || settlements[0]).shape)
}

async function cityCentroid(city) {
    const key = normalizeAddressText(city)
    if (!key) return null
    const cached = cityCache.get(key)
    if (cached && Date.now() - cached.at < CITY_TTL_MS) return cached.point

    const results = await searchGovmapLive({ searchText: city, maxResults: 5 })
    const point = pickSettlementPoint(results, city)
    cityCache.set(key, { point, at: Date.now() })
    return point
}

/**
 * Looks up the coordinates of city+street+building.
 * Returns { address, streetPoint, cityPoint }; address only on an exact house hit.
 */
export async function lookupGovmap({ city, street, building } = {}) {
    const cityName = String(city || '').trim()
    const streetName = String(street || '').trim()
    const buildingNo = String(building ?? '').trim()
    const out = { address: null, streetPoint: null, cityPoint: null }
    if (!cityName || !streetName) return out

    if (buildingNo) {
        const exactResults = await searchGovmapLive({
            searchText: `${streetName} ${buildingNo} ${cityName}`,
            filterType: 'address',
            maxResults: 8
        })
        let match = pickAddressResult(exactResults, {
            city: cityName,
            street: streetName,
            building: buildingNo
        })

        // "3א" / "3/1" are often stored as the base number; retry once.
        if (!match) {
            const base = buildingNo.match(/^\d+/)?.[0]
            if (base && base !== buildingNo) {
                const retryResults = await searchGovmapLive({
                    searchText: `${streetName} ${base} ${cityName}`,
                    filterType: 'address',
                    maxResults: 8
                })
                match = pickAddressResult(retryResults, {
                    city: cityName,
                    street: streetName,
                    building: base
                })
            }
        }

        if (match) {
            out.address = {
                location: { type: 'Point', coordinates: match.point },
                accuracy: 'ROOFTOP',
                source: 'govmap',
                providerText: match.result.text || null
            }
            return out
        }
    }

    const streetResults = await searchGovmapLive({
        searchText: `${streetName} ${cityName}`,
        maxResults: 8
    })
    out.streetPoint = pickStreetPoint(streetResults, cityName)
    out.cityPoint = pickSettlementPoint(streetResults, cityName)
    if (!out.streetPoint && !out.cityPoint)
        out.cityPoint = await cityCentroid(cityName)
    return out
}

/** Free-text lookup (admin geocode route). Exact address results only. */
export async function lookupGovmapText(text) {
    const query = String(text || '').trim()
    if (!query) return null
    const results = await searchGovmapLive({ searchText: query, filterType: 'address', maxResults: 8 })
    const address = (results || []).find(r => r?.type === 'address' && parseShapePoint(r.shape))
    if (!address) return null
    return {
        location: { type: 'Point', coordinates: parseShapePoint(address.shape) },
        accuracy: 'ROOFTOP',
        source: 'govmap',
        providerText: address.text || null
    }
}

/** Test helper: forget the city centroid cache and breaker state. */
export function resetGovmapState() {
    cityCache.clear()
    failures = 0
    openUntil = 0
    lastWarnAt = 0
}
