import { searchAddress } from '#server/external/addressProvider/index.js'

/**
 * POST /api/address/autocomplete
 * payload: { q, city, street, type: 'city'|'street'|'building', limit }
 * city/street are answered from the in-memory GovAddress index (official names
 * + aliases); building may fall through osm/google.
 */
export default async function autocomplete(payload, { DL }) {
    const { q = '', city, street, type = 'street', limit = 10 } = payload

    // Basic sanitization
    const cleanQ = String(q).trim().slice(0, 100)
    if (cleanQ.length === 0 && type !== 'city' && !city) return []

    const res = await searchAddress({ DL, q: cleanQ, city, street, type, limit: Math.min(Number(limit) || 10, 20) })
    return res
}

autocomplete.config = { auth: 'lax', log: false }
