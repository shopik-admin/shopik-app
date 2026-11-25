/**
 * Pure helpers for the GovMap address import.
 *
 * The streets feed carries both official street names and synonyms:
 *   street_name_status = 'official'          → the display/official name
 *   street_name_status = 'synonym of 123'    → an alias of official_code 123
 *
 * The import collapses each city+official_code into one document and keeps the
 * aliases in `aliases`, so autocomplete can offer only the official name while
 * still matching the names people actually type.
 */

const OFFICIAL = 'official'
const SYNONYM_RE = /^synonym of (\d+)$/

export function cityOf(record) {
    return String(record?.city_name_he ?? record?.city_name ?? '').trim().replace(/\s+/g, ' ')
}

export function streetOf(record) {
    return String(record?.street_name ?? '').trim().replace(/\s+/g, ' ')
}

export function statusOf(record) {
    return String(record?.street_name_status ?? '').trim().toLowerCase()
}

export function isOfficial(record) {
    return statusOf(record) === OFFICIAL
}

/** Returns the official street code a synonym points at, or null. */
export function synonymCodeOf(record) {
    const match = SYNONYM_RE.exec(statusOf(record))
    return match ? match[1] : null
}

/** Stable key for one physical street inside a city. */
export function officialCodeOf(record) {
    const code = record?.official_code ?? record?.street_code
    if (code !== undefined && code !== null && String(code).trim() !== '')
        return String(code).trim()
    // Feeds/tests without codes: the (unique per city) street name is the key.
    return streetOf(record)
}

// One city-only doc per city for city autocomplete (street='' sentinel).
export function buildCityDoc(record, seen) {
    const city = cityOf(record)
    if (!city) return null
    const key = `${city}::`
    if (seen.has(key)) return null
    seen.add(key)
    return { city, street: '' }
}

// One official doc per city+official_code. Aliases are added by the alias phase.
export function buildOfficialStreetDoc(record, seen) {
    const city = cityOf(record)
    const street = streetOf(record)
    if (!city || !street) return null
    const status = statusOf(record)
    // Never let a synonym overwrite its official street. Rows without a status
    // (older feeds / tests) are treated as official.
    if (synonymCodeOf(record)) return null
    if (status && status !== OFFICIAL) return null
    const officialCode = officialCodeOf(record)
    const key = `${city}::${officialCode}`
    if (seen.has(key)) return null
    seen.add(key)
    return {
        city,
        street,
        streetCode: String(record?.street_code ?? '').trim(),
        officialCode,
        aliases: [],
        fallback: false
    }
}

// One alias row (synonym → official code). Applied as a $addToSet update.
export function buildAliasRecord(record, seen) {
    const city = cityOf(record)
    const alias = streetOf(record)
    const officialCode = synonymCodeOf(record)
    if (!city || !alias || !officialCode) return null
    const key = `${city}::${officialCode}::${alias}`
    if (seen.has(key)) return null
    seen.add(key)
    return {
        city,
        officialCode,
        alias,
        streetCode: String(record?.street_code ?? '').trim()
    }
}
