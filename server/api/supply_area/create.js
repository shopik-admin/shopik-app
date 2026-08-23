import { normalizePolygon, validatePolygon, validateNoOverlap } from '#server/external/supplyArea.js'

export default async function create(payload, { DL }) {
    const { name, key, description, location, stores } = payload

    if (!name || !key || !location)
        throw { status: 400, message: 'Missing required fields: name, key, location' }

    validatePolygon(location)
    const normalizedLocation = normalizePolygon(location)
    await validateNoOverlap(DL, normalizedLocation)

    const created = await DL.SupplyArea.create({
        name,
        key,
        description,
        location: normalizedLocation,
        stores: stores?.map(id => ({ storeId: id })) || []
    })

    return created
}

create.config = {
    required: ['name', 'key', 'location'],
    permissions: ['supply_area:create'],
    preventMultiple: true
}