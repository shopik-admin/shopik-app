// Short-barcode alias resolution for GS1 enrich.
//
// Israeli internal codes are stored short in Products (e.g. '645748') while GS1
// carries the full GTIN (e.g. '7290004645748'). A GTIN is
// companyPrefix + itemReference + checkDigit, and the company-prefix length
// varies per supplier, so the short is any proper SUFFIX of the GTIN:
//   '7290004645748' → '645748', '4645748', '04645748', '004645748', ...
// The old prefix+zeros rule only matched item references that were zero-padded;
// it missed suffixes preceded by a non-zero company-prefix digit (the '4' in the
// example above).
//
// An alias is valid iff the short is at least GS1_ALIAS_MIN_LEN chars and
// EXACTLY ONE distinct product matches (otherwise the GTIN is ambiguous and
// nothing is enriched). Compared as strings, never numbers — '0123456' and
// '123456' stay distinct. GS1_ALIAS_ENABLED=0 disables guessing (exact matches
// and explicit manual mappings only).

export const aliasMinLen = () => Number(process.env.GS1_ALIAS_MIN_LEN || 6)

export const aliasEnabled = () => process.env.GS1_ALIAS_ENABLED !== '0'

// All proper suffixes of a GTIN, longest first, deduped by value. A proper
// suffix is at least one digit shorter than the GTIN — exact matches are
// resolved before aliasing ever runs.
export function aliasCandidates(gtin, minLen = aliasMinLen()) {
    const s = String(gtin ?? '')
    if (!/^\d+$/.test(s)) return []
    const out = []
    const seen = new Set()
    for (let cut = 1; cut <= s.length - minLen; cut++) {
        const candidate = s.slice(cut)
        if (candidate.length < minLen || seen.has(candidate)) continue
        seen.add(candidate)
        out.push(candidate)
    }
    return out
}

// Resolve a GTIN against a set of existing product barcodes.
// An explicit manual mapping (confirmed in the admin UI) wins even when it is
// not a derivable suffix. Returns { short } on a unique match,
// { ambiguous: [...] } on 2+ distinct matches, null on no match.
export function resolveAlias(gtin, productSet, minLen = aliasMinLen(), override = '') {
    if (!productSet || typeof productSet.has !== 'function') return null
    if (override) return productSet.has(override) ? { short: override, manual: true } : null
    if (!aliasEnabled()) return null
    const hits = aliasCandidates(gtin, minLen).filter(c => productSet.has(c))
    if (hits.length === 1) return { short: hits[0] }
    if (hits.length > 1) return { ambiguous: hits.sort() }
    return null
}

export default { aliasMinLen, aliasEnabled, aliasCandidates, resolveAlias }
