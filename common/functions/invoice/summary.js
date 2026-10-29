/**
 * Copy the provider's VAT numbers out of a `createDoc` response.
 *
 * EZcount computes the legal net/VAT split; we only store what it returns. If
 * the response carries no breakdown, this returns null and no breakdown is
 * shown anywhere — it is never re-derived locally.
 */
const TOTAL_KEYS = ['total', 'total_amount', 'price_total', 'amount', 'doc_total', 'sum']
const VAT_KEYS = ['vat', 'vat_amount', 'tax', 'tax_amount', 'maam']
const NET_KEYS = ['net', 'net_amount', 'total_before_vat', 'before_vat', 'subtotal']

function firstNumber(source, keys) {
    if (!source || typeof source !== 'object') return undefined
    for (const key of keys) {
        const value = source[key]
        if (value === null || value === undefined || value === '') continue
        const n = Number(value)
        if (Number.isFinite(n)) return n
    }
    return undefined
}

export function readVatSummary(response) {
    if (!response || typeof response !== 'object') return null
    const sources = [response, response.doc, response.data, response.document].filter(Boolean)
    let total, vat, net
    for (const source of sources) {
        if (total === undefined) total = firstNumber(source, TOTAL_KEYS)
        if (vat === undefined) vat = firstNumber(source, VAT_KEYS)
        if (net === undefined) net = firstNumber(source, NET_KEYS)
    }
    if (total === undefined && vat === undefined && net === undefined) return null
    return { total, vat, net }
}
