export default function distanceMeters(a, b) {
    // a,b = [lng, lat]
    if (!a || !b || a.length !== 2 || b.length !== 2) return Infinity
    const toRad = d => d * Math.PI / 180
    const [lng1, lat1] = a
    const [lng2, lat2] = b
    const R = 6371000
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(s))
}

// Proximity suggestion: 150m default. Heuristic: dense urban → 80-120m (apartments close, GPS bounce risks false unlock),
// suburban/rural → 150-250m (larger plots, gate distance). Keep 150m as balanced default for Israel; make it data-driven per store later
// via store metadata or supply_area density.
