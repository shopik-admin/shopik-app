import { validateAddress } from '#server/external/addressProvider/index.js'
import { findByLocation } from '#server/external/supplyArea.js'

/**
 * POST /api/address/validate
 * payload: { city, street, building }
 * Returns: { city, street, building, location, hasService, source }
 */
export default async function validate(payload, { DL }) {
    const { city, street, building } = payload
    if (!city || !street || !building) throw { status: 400, message: 'city, street, building required' }

    const validated = await validateAddress({ DL, city, street, building })
    if (!validated?.location) throw { status: 404, message: 'address not found' }

    // Check service area
    let hasService = false
    try {
        const area = await findByLocation(DL, validated.location)
        hasService = !!area
    } catch {}

    return { ...validated, hasService }
}

validate.config = { auth: 'lax', required: ['city', 'street', 'building'] }
