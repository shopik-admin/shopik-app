/**
 * GovMap local DB provider — collection gov_addresses (city/street/aliases).
 *
 * The hot path answers from the in-memory street index (streetIndex.js), so a
 * keystroke costs no Mongo operation. `ADDRESS_STREET_CACHE=off` restores the
 * legacy per-request queries as a rollback switch.
 */
import { getStreetIndex } from './streetIndex.js'

export async function searchGovmap({ DL, q, city, street, type = 'street', limit = 10 }) {
    if (process.env.ADDRESS_STREET_CACHE === 'off')
        return searchMongo({ DL, q, city, type, limit })

    const index = getStreetIndex(DL)
    if (!index) return []
    return index.search({ q, type, city, limit })
}

async function searchMongo({ DL, q, city, type = 'street', limit = 10 }) {
    if (!DL?.GovAddress) return []
    const query = (q || '').trim()
    if (!query && !city) return []

    try {
        if (type === 'city') {
            // distinct() rides the (city, street) index; the group/sort aggregate
            // scanned the whole address collection when the box was empty.
            const match = query ? { city: new RegExp(`^${escapeRegex(query)}`) } : {}
            const cities = await DL.GovAddress.Model.distinct('city', match)
            return (cities || [])
                .filter(Boolean)
                .sort((a, b) => String(a).localeCompare(String(b), 'he'))
                .slice(0, limit)
                .map(city => ({
                    label: city,
                    city,
                    source: 'govmap'
                }))
        }

        if (type === 'street') {
            if (!city) return []
            const filter = { city, street: { $ne: '' } }
            if (query) filter.street = new RegExp(escapeRegex(query))
            const docs = await DL.GovAddress.Model.find(filter)
                .select({ _id: 0, street: 1, aliases: 1 })
                .sort({ street: 1 })
                .limit(limit)
                .lean()
            return (docs || []).map(doc => ({
                label: doc.street,
                city,
                street: doc.street,
                source: 'govmap'
            }))
        }
    } catch (e) {
        console.warn('[govmap] search failed', e.message)
    }
    return []
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
