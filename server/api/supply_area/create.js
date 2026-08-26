import { normalizePolygon, validatePolygon, validateNoOverlap } from '#server/external/supplyArea.js'

export default async function create(payload, { DL }) {
    const { name, location, stores } = payload

    if (!location)
        throw { status: 400, message: 'Missing required field: location' }

    validatePolygon(location)
    const normalizedLocation = normalizePolygon(location)
    await validateNoOverlap(DL, normalizedLocation)

    const created = await DL.SupplyArea.create({
        name: name || '',
        location: normalizedLocation,
        stores: stores?.map(id => ({ storeId: id })) || []
    })

    return created
}

create.config = {
    required: ['location'],
    permissions: ['supply_area:create'],
    preventMultiple: true
}