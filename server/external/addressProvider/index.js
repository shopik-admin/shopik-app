import { ADDRESS_PROVIDERS, ADDRESS_PROVIDER_CHAIN } from '#common/constants.js'
import { searchGovmap } from './govmap.js'
import { searchGoogle } from './google.js'
import { searchOsm } from './osm.js'

const providers = {
    [ADDRESS_PROVIDERS.GOVMAP]: searchGovmap,
    [ADDRESS_PROVIDERS.OSM]: searchOsm,
    [ADDRESS_PROVIDERS.GOOGLE]: searchGoogle,
}

function getChain() {
    const env = (process.env.ADDRESS_PROVIDER || ADDRESS_PROVIDERS.HYBRID).toLowerCase()
    return ADDRESS_PROVIDER_CHAIN[env] || ADDRESS_PROVIDER_CHAIN[ADDRESS_PROVIDERS.HYBRID]
}

export async function searchAddress({ DL, q, city, street, type, limit }) {
    // Per user request: Redis (govmap) contains only serviceable cities/streets.
    // For city/street we return only govmap results — outside areas show "no service" (empty).
    // For building we allow fallback chain (govmap -> osm -> google) for numbers not in DB.
    const isBuilding = type === 'building'
    const chain = isBuilding ? getChain() : [ADDRESS_PROVIDERS.GOVMAP]
    for (const name of chain) {
        const fn = providers[name]
        if (!fn) continue
        const res = await fn({ DL, q, city, street, type, limit })
        if (res?.length) return res
    }
    return []
}

export async function validateAddress({ DL, city, street, building }) {
    // Try govmap building exact match first (single collection)
    if (DL?.GovAddress) {
        const found = await DL.GovAddress.readOne({ city, street, building: String(building) }, { _id: 0, location: 1 })
        if (found?.location) return { ...found, source: 'govmap', city, street, building }
    }
    // Fallback to Google geocode for coordinates/hasService
    const { geocodeGoogle } = await import('./google.js')
    return geocodeGoogle({ city, street, building })
}
