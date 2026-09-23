// Short-barcode alias resolution for GS1 enrich.
//
// Israeli internal codes are stored short in Products (e.g. '2519898') while
// GS1 carries the full GTIN (e.g. '7290002519898' = '729' + '000' + '2519898').
// An alias is valid iff GTIN = prefix (1-3 digits) + 1+ zeros + short, compared
// as strings (never numbers — '0123456' and '123456' stay distinct), the short
// is at least GS1_ALIAS_MIN_LEN chars, and EXACTLY ONE distinct product matches
// (otherwise the GTIN is skipped as ambiguous and nothing is enriched).
// GS1_ALIAS_ENABLED=0 disables aliasing (exact matches only).

export const aliasMinLen = () => Number(process.env.GS1_ALIAS_MIN_LEN || 7)

export const aliasEnabled = () => process.env.GS1_ALIAS_ENABLED !== '0'

// All candidate shorts derivable from a GTIN (deduped by value). The same
// candidate can derive from two prefix splits (e.g. '70|001234567' and
// '700|01234567' both yield '1234567') — the Set keeps one copy so a single
// valid match never looks ambiguous. Zero-separator length also varies so
// shorts with leading zeros stay matchable.
export function aliasCandidates(gtin, minLen = aliasMinLen()) {
    const s = String(gtin ?? '')
    if (!/^\d+$/.test(s)) return []
    const out = new Set()
    for (let p = 1; p <= 3 && p < s.length; p++) {
        const rest = s.slice(p)
        const zeros = /^0+/.exec(rest)?.[0].length || 0
        if (!zeros) continue
        for (let sep = 1; sep <= zeros; sep++) {
            const candidate = rest.slice(sep)
            if (candidate.length >= minLen && candidate.length < s.length) out.add(candidate)
        }
    }
    return [...out]
}

// Resolve a GTIN against a set of existing product barcodes.
// Returns { short } on a unique match, { ambiguous: [...] } on 2+ distinct
// matches, null on no match (or when aliasing is disabled).
export function resolveAlias(gtin, productSet, minLen = aliasMinLen()) {
    if (!aliasEnabled()) return null
    if (!productSet || typeof productSet.has !== 'function') return null
    const hits = aliasCandidates(gtin, minLen).filter(c => productSet.has(c))
    if (hits.length === 1) return { short: hits[0] }
    if (hits.length > 1) return { ambiguous: hits.sort() }
    return null
}

export default { aliasMinLen, aliasEnabled, aliasCandidates, resolveAlias }
