// Address autocomplete + geocoding stress scenario.
//
// The generic sweep deliberately skips address/autocomplete and address/validate
// (they were "no DB read" routes). They are now the hot path of the new
// in-memory street index, so they get their own measured windows:
//
//   1. warm-up: one city/street query per fixture city + one validate per
//      address (fills the street index and the GeocodeCache),
//   2. autocomplete burst — must show ZERO gov_addresses operations,
//   3. validate burst on cached addresses — no external provider calls,
//   4. cold autocomplete across cities not warmed above — one indexed read per
//      city is the expected cost,
//   5. optional cold geocode (bounded, real GovMap/Google calls).
//
// Results are printed next to the DB facts the observer collected, so a
// regression (a missing cache / an accidental COLLSCAN) is visible immediately.

import { latencyStats, pool, sleep } from './util.js'

const ADDRESSES = [
    { city: 'ירושלים', street: 'יפו', building: '100' },
    { city: 'בני ברק', street: 'רבי עקיבא', building: '50' },
    { city: 'בת ים', street: 'הרצל', building: '50' },
    { city: 'חולון', street: 'הרוקמים', building: '26' },
    { city: 'ביתר עילית', street: 'בן זכאי', building: '3' }
]

const COLD_CITIES = [
    'תל אביב - יפו', 'רמת גן', 'פתח תקווה', 'אשדוד', 'ראשון לציון',
    'נתניה', 'חיפה', 'באר שבע', 'רחובות', 'הרצליה',
    'גבעתיים', 'כפר סבא', 'מודיעין עילית', 'אלעד', 'בית שמש'
]

const govAddressOps = db =>
    (db?.profile?.worst || [])
        .filter(row => String(row.ns || '').includes('gov_addresses'))
        .reduce((sum, row) => sum + row.ops, 0)

function summarize(label, responses, db) {
    const failed = responses.filter(item => !item.ok)
    return {
        label,
        calls: responses.length,
        failures: failed.length,
        firstError: failed[0]?.error || null,
        stats: latencyStats(responses.map(item => item.ms)),
        db
    }
}

export async function runAddressStress({ clients, observer, opts, log = () => { } }) {
    const admin = clients?.admin
    if (!admin) throw new Error('address stress needs the admin session')
    if (!observer) throw new Error('address stress needs the DB observer')

    const concurrency = Math.max(1, opts.concurrency || 10)
    const burstCalls = Math.max(60, (opts.calls || 30) * 4)
    const outputs = {}

    // ---- warm-up (outside the windows: cache fills are not timed) ----------
    log('address: warming city/street index and geocode cache')
    const warmFailures = []
    for (const address of ADDRESSES) {
        const city = await admin.call('address/autocomplete', { q: address.city.slice(0, 2), type: 'city' })
        const street = await admin.call('address/autocomplete', {
            q: address.street.slice(0, 2),
            city: address.city,
            type: 'street'
        })
        if (!city.ok) warmFailures.push(`city ${address.city}: ${city.error || city.status}`)
        if (!street.ok) warmFailures.push(`street ${address.city}: ${street.error || street.status}`)
        // Fill GeocodeCache (GovMap/Google) before the latency burst.
        const validate = await admin.call('address/validate', address)
        if (!validate.ok) warmFailures.push(`validate ${address.city}: ${validate.error || validate.status}`)
    }

    // ---- warm autocomplete burst ------------------------------------------
    const autocompleteQueries = ADDRESSES.flatMap(address => [
        { q: address.city.slice(0, 2), type: 'city' },
        { q: address.street.slice(0, 2), city: address.city, type: 'street' },
        { q: address.street.slice(1, 3), city: address.city, type: 'street' }
    ])
    // The observer pads both window edges by 1s against server clock skew. The
    // warm-up runs the index's one-time city-list load; without a settle longer
    // than that pad, the load lands inside the measured window and the "0
    // gov_addresses ops" check fails even though the burst itself is clean.
    await sleep(1200)
    await observer.openWindow('address/autocomplete')
    const autocompleteResponses = await pool(burstCalls, concurrency, index =>
        admin.call('address/autocomplete', autocompleteQueries[index % autocompleteQueries.length]))
    outputs.autocomplete = summarize(
        'autocomplete (warm)',
        autocompleteResponses,
        await observer.closeWindow()
    )

    // ---- warm validate burst (cache hits + one geo query each) -------------
    await observer.openWindow('address/validate')
    const validateResponses = await pool(burstCalls, concurrency, index =>
        admin.call('address/validate', ADDRESSES[index % ADDRESSES.length]))
    outputs.validate = summarize(
        'validate (cached)',
        validateResponses,
        await observer.closeWindow()
    )

    // ---- cold street-list loads (one indexed read per city) ----------------
    const coldCities = COLD_CITIES
        .filter(city => !ADDRESSES.some(address => address.city === city))
        .slice(0, Number(opts.addressColdCities) || 10)
    await observer.openWindow('address/autocomplete/cold')
    const coldResponses = await pool(coldCities.length, Math.min(4, concurrency), index =>
        admin.call('address/autocomplete', { q: 'הרצל', city: coldCities[index], type: 'street' }))
    outputs.cold = summarize(
        'autocomplete (cold cities)',
        coldResponses,
        await observer.closeWindow()
    )

    // ---- cold geocode (bounded, real providers) ----------------------------
    const coldGeocodeCount = Number(opts.addressColdGeocode) || 0
    if (coldGeocodeCount > 0) {
        const coldAddresses = Array.from({ length: coldGeocodeCount }, (_, index) => ({
            city: 'חולון',
            street: 'הרוקמים',
            building: String(2 + index * 2)
        }))
        await observer.openWindow('address/validate/cold')
        const coldValidate = await pool(coldAddresses.length, Math.min(2, concurrency), index =>
            admin.call('address/validate', coldAddresses[index]))
        outputs.coldGeocode = summarize(
            'validate (cold geocode)',
            coldValidate,
            await observer.closeWindow()
        )
    }

    return { warmFailures, ...outputs }
}

export function printAddressStress(result, { target } = {}) {
    const maxP95 = target === 'test' ? 200 : 50
    const autocompleteOps = govAddressOps(result.autocomplete?.db)
    const problems = []

    if (result.warmFailures?.length) problems.push(`${result.warmFailures.length} warm-up failure(s)`)
    if (result.autocomplete?.failures) problems.push(`${result.autocomplete.failures} autocomplete failure(s)`)
    if (autocompleteOps > 0) problems.push(`${autocompleteOps} gov_addresses op(s) in the warm autocomplete window`)
    for (const key of ['autocomplete', 'validate', 'cold']) {
        const window = result[key]?.db
        if (window?.collscans) problems.push(`${window.collscans} COLLSCAN(s) in ${result[key].label}`)
    }
    if (result.autocomplete?.stats?.p95 > maxP95)
        problems.push(`autocomplete p95 ${result.autocomplete.stats.p95}ms > ${maxP95}ms`)

    const status = problems.length ? 'FAIL' : 'PASS'
    console.log(`\n[address] ${status}${problems.length ? ` — ${problems.join('; ')}` : ''}`)

    for (const key of ['autocomplete', 'validate', 'cold', 'coldGeocode']) {
        const window = result[key]
        if (!window) continue
        const p95 = window.stats?.p95 ?? '—'
        const p50 = window.stats?.p50 ?? '—'
        const ops = window.db?.profile
            ? window.db.profile.totalOps
            : 'n/a'
        console.log(`  ${window.label}: ${window.calls} calls, failures ${window.failures}, p50 ${p50}ms, p95 ${p95}ms, dbOps ${ops}, collscans ${window.db?.collscans ?? 0}`)
    }
    console.log(`  gov_addresses ops in warm autocomplete: ${autocompleteOps} (expected 0)`)
    if (!result.autocomplete?.db?.profile)
        console.log('  note: profiler unavailable (test/Atlas) — the 0-op assertion needs --target local')

    return problems.length === 0
}
