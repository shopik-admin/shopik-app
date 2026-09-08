function normalizePart(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeAddressParts({ city, street, building }) {
    return {
        city: normalizePart(city),
        street: normalizePart(street),
        building: normalizePart(building)
    }
}

export function buildGeocodeKey({ city, street, building }) {
    const { city: c, street: s, building: b } = normalizeAddressParts({ city, street, building })
    if (!c || !s || !b) return null
    return `${c}:${s}:${b}`
}
