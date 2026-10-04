// Resolves the storefront price for a single domain.
//
// The storefront works with a flat `price` only and never sees the
// multi-domain `prices` array (cross-tenant data). The domain always comes
// from the server (router-resolved body.domainId), never from the client.
//
// Rules per product:
// - `prices` entry for the domain exists → set flat `price`, drop `prices`.
// - no `prices` array but a flat `price` already present (idempotent re-run,
//   e.g. cached display payloads) → keep as-is.
// - otherwise (not sold in this domain) → dropped from the result.
export function withDomainPrice(products, domainId) {
    const list = Array.isArray(products) ? products : []
    const out = []
    for (const p of list) {
        if (!p || typeof p !== 'object') continue
        if (!Array.isArray(p.prices)) {
            if (p.price != null) out.push(p)
            continue
        }
        const entry = p.prices.find(e => e?.domainId === domainId)
        if (!entry || entry.price == null) continue
        const { prices, ...rest } = p
        out.push({ ...rest, price: entry.price })
    }
    return out
}

// Single-product variant. Returns the priced product or null.
export function withDomainPriceOne(product, domainId) {
    const [priced] = withDomainPrice(product ? [product] : [], domainId)
    return priced ?? null
}

export default { withDomainPrice, withDomainPriceOne }
