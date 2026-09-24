import { collectProductCodes } from '#server/services/gs1/sync.js'

// POST /api/gs1/retention { year } → read-only probe: page that year's GS1
// message queue and diff identifiers against stored gs1_products.
// No run, no watermark move, no queue/DB writes — safe to run any time.
const SAMPLE_CAP = 50

export default async function gs1Retention(payload, { DL, external }) {
    const thisYear = new Date().getFullYear()
    const year = Number(payload?.year)
    if (!Number.isInteger(year) || year < 2000 || year > thisYear)
        throw { status: 400, message: `year must be an integer 2000-${thisYear}` }

    const codes = await collectProductCodes(external, new Date(year, 0, 1), new Date(year, 11, 31))

    // Stored identifiers: exact productCodes plus GTINs (codes are often
    // event-shaped like IL_<GLN>_<GTIN>_<ts>, so a stored GTIN contained in
    // the code counts as already-known).
    const stored = await DL.Gs1Product.read(
        {},
        { _id: 0, barcode: 1, productCode: 1 },
        { limit: 0 }
    )
    const storedCodes = new Set()
    const storedGtins = new Set()
    for (const s of stored || []) {
        if (s?.productCode) storedCodes.add(String(s.productCode))
        if (s?.barcode) storedGtins.add(String(s.barcode))
    }

    let exact = 0
    let gtinContained = 0
    const unknownSamples = []
    for (const code of codes) {
        const s = String(code ?? '')
        if (!s) continue
        if (storedCodes.has(s) || storedGtins.has(s)) {
            exact++
            continue
        }
        // Digit runs of an event-shaped code (GLN, GTIN, timestamp parts).
        const runs = s.split(/\D+/).filter(r => r.length >= 8)
        if (runs.some(r => storedGtins.has(r))) {
            gtinContained++
            continue
        }
        if (unknownSamples.length < SAMPLE_CAP) unknownSamples.push(s)
    }
    const known = exact + gtinContained
    return {
        year,
        messages: codes.length,
        known,
        unknown: codes.length - known,
        matchBreakdown: { exact, gtinContained },
        unknownSamples,
        storedDocs: stored?.length || 0
    }
}

gs1Retention.config = {
    required: ['year'],
    permissions: ['product:read'],
    auth: 'required',
    preventMultiple: true
}
