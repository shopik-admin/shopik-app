import geocode from '#server/external/geocode.js'

const GOOGLE_PLACES_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'
const GOOGLE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'

export async function searchGoogle({ q, city, street, type = 'street' }) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) return []

    const input = type === 'city' ? q
        : type === 'street' ? `${q} ${city || ''}`.trim()
        : `${q} ${street || ''} ${city || ''}`.trim()

    if (!input) return []

    const params = new URLSearchParams({
        input,
        key: apiKey,
        language: 'iw',
        components: 'country:il',
        types: type === 'city' ? '(cities)' : 'address'
    })

    try {
        const res = await fetch(`${GOOGLE_PLACES_URL}?${params}`)
        const data = await res.json()
        if (data.status !== 'OK' || !data.predictions?.length) return []
        return data.predictions.slice(0, 5).map(p => ({
            label: p.description,
            description: p.description,
            place_id: p.place_id,
            city: city || extractCity(p),
            street: p.structured_formatting?.main_text || p.description,
            source: 'google',
            _raw: p
        }))
    } catch (e) {
        console.warn('[google] autocomplete failed', e.message)
        return []
    }
}

export async function geocodeGoogle({ city, street, building }) {
    try {
        const address = { city, street, building }
        const res = await geocode.address(address)
        return { ...res, source: 'google' }
    } catch (e) {
        console.warn('[google] geocode failed', e.message)
        return null
    }
}

function extractCity(prediction) {
    const terms = prediction.terms || []
    return terms[terms.length - 2]?.value || ''
}
