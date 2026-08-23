export default async function lookup(payload, { external }) {
    const geocoded = await external.geocode.address({
        street: payload.street,
        building: payload.building,
        city: payload.city
    })

    if (!geocoded.location)
        throw { status: 400, message: 'Could not geocode this address' }

    return geocoded
}

lookup.config = {
    required: ['city', 'street', 'building'],
    permissions: ['supply_area:read']
}