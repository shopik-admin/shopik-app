import { round2 } from './calcOrder/utils.js'

// Row (line) price of a cart line: what the customer actually pays for the
// line, against what the same line would cost at the regular unit price.
//
// totalSum is the money split the server calculated for the line
// (common/functions/calcOrder/cart.js -> applyCalcToCart). It already
// accounts for percent sales, multi-buy bundles and the agorot split of a
// bundle price, so it is the only trustworthy source. price * amount is the
// fallback for a line that was never synced (fresh guest cart).

const DISCOUNT_EPSILON = 0.005

export function getRowPriceInfo(item) {
    if (!item) return null
    const unitPrice = Number(item.price)
    const amount = Number(item.amount) || 0
    if (!isFinite(unitPrice)) return null

    const regular = round2(unitPrice * amount)
    const hasServerTotal = typeof item.totalSum === 'number' && isFinite(item.totalSum)
    const total = hasServerTotal ? round2(item.totalSum) : regular
    const discount = round2(regular - total)

    return {
        unitPrice,
        amount,
        regular,
        total,
        discount,
        hasDiscount: discount > DISCOUNT_EPSILON
    }
}

// A multi-buy sale ("4 for 10") only pays off once the bundle is complete.
// The server enforces that threshold (common/functions/calcOrder/applySales.js
// -> isSaleEligible); the client mirrors it so a line holding a stale total
// never shows a discount the customer does not actually get.
export function isBundleSale(sale) {
    if (!sale) return false
    return sale.kind === 'price' && Number(sale.amount) > 1
}

export function isBundleReached(sale, saleAmount) {
    if (!isBundleSale(sale)) return true
    const required = Number(sale.amount)
    const current = Number(saleAmount) || 0
    return current >= required
}
