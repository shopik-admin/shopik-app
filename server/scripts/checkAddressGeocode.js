/**
 * Read-only smoke test for the GovMap → Google geocoding chain.
 *
 * Runs real network calls (GovMap, and Google only when GovMap misses) but
 * disables the local GeocodeCache so a probe never pollutes/uses it.
 *
 * Usage:
 *   node server/scripts/checkAddressGeocode.js
 *   node server/scripts/checkAddressGeocode.js --address "ביתר עילית|בן זכאי|3" --address "חולון|הרוקמים|26"
 *
 * Env: GOOGLE_MAPS_API_KEY for the Google fallback; GOVMAP_* for GovMap.
 */
import boot from '../boot.js'
import { resolveAddress } from '../external/geocode.js'

const DEFAULT_ADDRESSES = [
    { city: 'ירושלים', street: 'יפו', building: '100' },
    { city: 'בני ברק', street: 'רבי עקיבא', building: '50' },
    { city: 'בת ים', street: 'הרצל', building: '50' },
    { city: 'חולון', street: 'הרוקמים', building: '26' },
    { city: 'ביתר עילית', street: 'בן זכאי', building: '3' },
    { city: 'ביתר עילית', street: 'בן זכאי', building: '999' }
]

function parseAddresses(argv) {
    const addresses = []
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] !== '--address') continue
        const [city, street, building] = String(argv[++i] || '').split('|')
        if (city && street && building) addresses.push({ city: city.trim(), street: street.trim(), building: building.trim() })
    }
    return addresses
}

const bootData = await boot()
// A probe must not read or write the shared geocode cache.
const DL = { ...bootData.DL, GeocodeCache: null }
const addresses = parseAddresses(process.argv.slice(2))

for (const address of addresses.length ? addresses : DEFAULT_ADDRESSES) {
    const startedAt = Date.now()
    const result = await resolveAddress({ DL, ...address })
    const ms = Date.now() - startedAt
    const label = `${address.street} ${address.building}, ${address.city}`
    if (!result?.location) {
        console.log(`FAIL  ${label} — no trustworthy point (${ms}ms)`)
        continue
    }
    const [lng, lat] = result.location.coordinates
    console.log(`OK    ${label} — ${result.source}/${result.accuracy} ${lat.toFixed(5)},${lng.toFixed(5)} (${ms}ms)`)
}

process.exit(0)
