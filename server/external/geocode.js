const GOOGLE_MAPS_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

async function geocodeAddress(address) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey)
        throw new Error('Missing Google Maps API Key')

    const addressString = `${address.street} ${address.building}, ${address.city}`

    const params = new URLSearchParams({
        address: addressString,
        components: 'country:IL',
        key: apiKey
    })

    const response = await fetch(`${GOOGLE_MAPS_GEOCODE_URL}?${params}`)

    if (!response.ok) {
        throw new Error(`Geocoding failed with status: ${response.status}`)
    }

    const data = await response.json()

    if (data.status !== 'OK' || !data.results.length)
        return address

    const [result] = data.results

    const { lat, lng } = result.geometry.location

    return {
        ...address,
        location: {
            type: 'Point',
            coordinates: [lng, lat]
        },
        accuracy: result.geometry.location_type
    }
}

const geocode = { address: geocodeAddress }
export default geocode