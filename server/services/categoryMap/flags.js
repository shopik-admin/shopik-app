import { FLAGS_HEADER } from '#common/constants/categoryFlags.js'
import { parseCsvRows } from './parse.js'

// The Comax category-filter file: the 8 catalog columns plus the two flags.
// It is deliberately separate from the 14-column tree file: importing it only
// flips flags on existing category_map rows, never the tree or assignments.
// The header list lives in common/ so the admin upload dialog can show it.
export { FLAGS_HEADER }

const COL = {
    SUB_GROUP_CODE: 7,
    SHOW_ON_SITE: 8,
    REQUIRE_KASHRUT: 9
}

const normalizeHeader = row =>
    (row || []).map(value => String(value ?? '').replace(/^\uFEFF/, '').trim())

function parseFlag(value, rowNumber, column) {
    const text = String(value ?? '').trim().toUpperCase()
    if (text === 'TRUE') return true
    if (text === 'FALSE') return false
    throw { status: 400, message: `invalid ${column} on row ${rowNumber}: ${value}` }
}

/**
 * Parse the flags CSV into distinct sub-group flags.
 *
 * Comax repeats the same sub-group on every product row (and quoted names may
 * contain line breaks), so duplicates are normal: they must agree. Non-numeric
 * codes are skipped and reported — the file can contain a repeated header row.
 */
export function parseFlagsCsv(csvText) {
    const rows = parseCsvRows(csvText)
    if (rows.length < 2)
        throw { status: 400, message: 'flags CSV is empty' }

    const header = normalizeHeader(rows[0])
    const wrong = FLAGS_HEADER
        .map((name, index) => (header[index] === name ? null : index))
        .filter(index => index !== null)
    if (wrong.length)
        throw {
            status: 400,
            message: `invalid flags CSV header (missing ${wrong.map(i => FLAGS_HEADER[i]).join(', ')})`
        }

    const byCode = new Map()
    const skipped = []

    rows.slice(1).forEach((row, index) => {
        const rowNumber = index + 2
        const code = String(row[COL.SUB_GROUP_CODE] ?? '').trim()
        if (!code) return
        if (!/^\d+$/.test(code)) {
            skipped.push({ code, row: rowNumber })
            return
        }

        const flags = {
            subGroupCode: code,
            showOnSite: parseFlag(row[COL.SHOW_ON_SITE], rowNumber, 'הצגת קטגוריה'),
            requireKashrut: parseFlag(row[COL.REQUIRE_KASHRUT], rowNumber, 'חובה כשרות')
        }

        const previous = byCode.get(code)
        if (previous) {
            if (previous.showOnSite !== flags.showOnSite || previous.requireKashrut !== flags.requireKashrut)
                throw {
                    status: 400,
                    message: `conflicting flags for sub-group ${code} (rows ${previous.row} and ${rowNumber})`
                }
            return
        }
        byCode.set(code, { ...flags, row: rowNumber })
    })

    return {
        flags: [...byCode.values()].map(({ row, ...flags }) => flags),
        skipped
    }
}

const sameFlags = (row, flags) =>
    (row.showOnSite !== false) === flags.showOnSite &&
    (row.requireKashrut === true) === flags.requireKashrut

/**
 * Write the flags onto existing category_map rows. Codes the map does not know
 * are reported and left alone; map rows the file does not mention keep their
 * current flags (missing flags already mean show + no kashrut rule).
 *
 * Returns the previous values so the caller can write a rollback file.
 */
export async function importCategoryFlags({ DL, csvText, dryRun = false }) {
    const { flags, skipped } = parseFlagsCsv(csvText)

    const rows = await DL.CategoryMap.read(
        {},
        { _id: 0, subGroupCode: 1, showOnSite: 1, requireKashrut: 1 },
        { limit: 0 }
    )
    const byCode = new Map((rows || []).map(row => [String(row.subGroupCode), row]))

    const known = []
    const unknown = []
    const unchanged = []
    for (const flagsForCode of flags) {
        const row = byCode.get(flagsForCode.subGroupCode)
        if (!row) {
            unknown.push(flagsForCode.subGroupCode)
            continue
        }
        if (sameFlags(row, flagsForCode)) {
            unchanged.push(flagsForCode.subGroupCode)
            continue
        }
        known.push({
            ...flagsForCode,
            previous: {
                showOnSite: row.showOnSite ?? null,
                requireKashrut: row.requireKashrut ?? null
            }
        })
    }

    const mentioned = new Set(flags.map(flag => flag.subGroupCode))
    const untouched = (rows || [])
        .map(row => String(row.subGroupCode))
        .filter(code => !mentioned.has(code))

    if (!dryRun && known.length) {
        await DL.CategoryMap.bulkWrite({
            docs: known,
            getFilter: doc => ({ subGroupCode: doc.subGroupCode }),
            getUpsert: () => false,
            getUpdate: doc => ({
                $set: {
                    showOnSite: doc.showOnSite,
                    requireKashrut: doc.requireKashrut
                }
            })
        })
    }

    return {
        codes: flags.length,
        written: dryRun ? 0 : known.length,
        pending: known.length,
        unchanged: unchanged.length,
        unknown,
        skipped,
        untouched,
        previous: known.map(({ subGroupCode, previous }) => ({ subGroupCode, ...previous }))
    }
}
