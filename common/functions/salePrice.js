import { round2, round3 } from './calcOrder/utils.js'
import { getSalesCache } from './salesCache.js'

// Sale pricing helpers shared by the storefront components and the server-side
// sitemap / Google Merchant feed. Pure (no React, no CSS) so the feed builder
// can import them.

export function getFirstSale(product, sales) {
    const saleId = product?.saleIds?.[0]
    if (!saleId) return null
    if (sales && sales[saleId]) return sales[saleId]
    try {
        const cache = getSalesCache?.()
        if (cache && cache[saleId]) return cache[saleId]
    } catch { }
    return null
}

export function getSalePriceInfo(product, sale) {
    if (!sale || !product) return null
    const regular = Number(product.price)
    if (isNaN(regular)) return null
    const amount = Number(sale.amount) || 1
    const kind = sale.kind
    const price = sale.price
    const percent = sale.percent
    let saleSingle = null
    let saleTotal = null
    if (kind === 'percent' && percent != null) {
        const p = Number(percent)
        saleSingle = round2(regular * (1 - p / 100))
        saleTotal = round2(saleSingle * amount)
    } else if (price != null) {
        const total = Number(price)
        saleTotal = round2(total)
        saleSingle = amount > 1 ? round2(total / amount) : saleTotal
    } else {
        return null
    }
    if (saleSingle < 0) saleSingle = 0
    if (saleTotal < 0) saleTotal = 0
    return { regular, saleSingle, saleTotal, amount, kind, isBundle: amount > 1 }
}

// A Google `sale_price` is the price of ONE unit. A quantity bundle ("3 ב-10")
// does not discount a single unit, so it has no valid feed representation.
export function isSingleUnitSale(sale) {
    return !!sale && (Number(sale.amount) || 1) <= 1
}

// How many units of a product actually get the sale price. Comax's maxQty is
// in base units (items, kg, …) and the cart engine applies the sale once per
// `amount` (applySales.js: floor(limit / amount) loops), so a "2 for ₪10" with
// limit 5 discounts 4 units — not 5. Displaying the same figure keeps the
// label from promising more than the money does. 0 means "no limit".
export function getSaleLimitUnits(sale) {
    const limit = Number(sale?.limit) || 0
    if (!(limit > 0)) return 0
    const rawAmount = Number(sale?.amount)
    const amount = rawAmount > 0 ? rawAmount : 1
    // Same expression as the engine, deliberately without an epsilon: the
    // label must agree with the charged price even for odd fractional data.
    return round3(Math.floor(limit / amount) * amount)
}

// The limit itself is not a warning — the shopper only needs to hear about it
// on the click that pushes past it (extra units are charged at full price).
export function isSaleLimitExceeded(sale, amount) {
    const units = getSaleLimitUnits(sale)
    if (!(units > 0)) return false
    return (Number(amount) || 0) > units + 1e-6
}

export default { getFirstSale, getSalePriceInfo, isSingleUnitSale, getSaleLimitUnits, isSaleLimitExceeded }
