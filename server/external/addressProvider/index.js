import { ADDRESS_PROVIDERS, ADDRESS_PROVIDER_CHAIN } from '#common/constants.js'
import { resolveAddress } from '#server/external/geocode.js'
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
    // City/street suggestions come from the local GovAddress index only: the
    // import is the national registry (official names + aliases), so no paid
    // provider is involved. Building suggestions (unused by the form today) may
    // still fall through govmap -> osm -> google.
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

/**
 * Resolves city+street+building to coordinates through the shared chain:
 * cache -> GovMap exact house -> Google (anchored/validated) -> GovMap street.
 * Returns null when no trustworthy point exists.
 */
export async function validateAddress({ DL, city, street, building }) {
    return resolveAddress({ DL, city, street, building })
}
