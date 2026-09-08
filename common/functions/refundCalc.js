// Shared refund math for admin cancel / partial-refund.
// Used by the admin UI (suggestions + live validation) and by
// server/api/payment/refund.js (authoritative validation).
// Agorot-safe: every money value is rounded to 2 decimals, comparisons use EPS.

export const REFUND_EPS = 0.001

export function round2(num) {
    const n = Number(num)
    if (!Number.isFinite(n)) return 0
    return Math.round((n + Number.EPSILON) * 100) / 100
}

export function getChargedSum(order) {
    return Number(order?.finalSumWithShipping ?? order?.finalSum ?? order?.sum ?? 0)
}

export function getRemaining(order) {
    return round2(getChargedSum(order) - Number(order?.refundedTotal || 0))
}

export function hasPercentCoupon(order) {
    return (order?.coupons || []).some(c => c?.percent === true || c?.benefit === 'percent')
}

// finalSum/sum ratio after coupon discount (1 = no discount). Bakes in
// percent rate, maxSum caps and multi-coupon totals.
export function couponRatio(order) {
    const sum = Number(order?.sum || 0)
    const finalSum = Number(order?.finalSum ?? sum)
    if (!(sum > 0)) return 1
    if (!(finalSum >= 0)) return 1
    return Math.min(1, Math.max(0, finalSum / sum))
}

// Max refundable for one cart line, given the coupon policy:
// - flat-sum coupon (or none): full line price (global charged cap still guards)
// - percent coupon: proportional share of the discount
export function lineMaxRefundable(line, order) {
    const total = Number(line?.totalSum || 0)
    const refunded = Number(line?.refundedAmount || 0)
    if (hasPercentCoupon(order)) {
        return Math.max(0, round2(round2(total * couponRatio(order)) - refunded))
    }
    return Math.max(0, round2(total - refunded))
}

export function shippingRemaining(order) {
    const shipping = Number(order?.finalShipping ?? order?.shipping ?? 0)
    return Math.max(0, round2(shipping - Number(order?.refundedShipping || 0)))
}

export function lineAvailableQty(line) {
    const q = Number(line?.finalAmount ?? line?.amount ?? 0)
    return Number.isFinite(q) && q > 0 ? q : 0
}

// A line is refundable only if it was actually supplied and charged.
// Missing lines (חוסרים) and zero-quantity lines were never captured,
// so refunding them would drive the order negative.
export function isLineRefundable(line, order) {
    if (!line) return false
    if (line.missing) return false
    if (lineAvailableQty(line) <= 0) return false
    return lineMaxRefundable(line, order) > 0
}

// Expand a line's priceDistribution into per-unit values, most expensive
// first so the customer keeps the cheapest units (sale units refund last).
// Unit value = totalSum/amount (exact, agora-adjusted) — not salePrice.
export function unitValuesExpensiveFirst(line) {
    const dists = (line?.priceDistribution || [])
        .map(d => ({
            amount: Number(d?.amount || 0),
            totalSum: Number(d?.totalSum || 0),
        }))
        .filter(d => d.amount > 0 && d.totalSum >= 0)
        .map(d => ({ ...d, unitValue: d.totalSum / d.amount }))
        .sort((a, b) => b.unitValue - a.unitValue)
    // No breakdown stored (legacy lines): fall back to flat unit price.
    if (dists.length === 0) {
        const qty = lineAvailableQty(line)
        const total = Number(line?.totalSum || 0)
        if (qty > 0 && total > 0) return [{ amount: qty, totalSum: total, unitValue: total / qty }]
        return []
    }
    return dists
}

// Suggested refund sum for refunding `qty` units of a line (expensive first).
// Supports fractional qty (weight products) by taking a partial bucket.
export function suggestRefundForQty(line, qty) {
    let want = Number(qty || 0)
    if (!(want > 0)) return 0
    let sum = 0
    for (const bucket of unitValuesExpensiveFirst(line)) {
        if (want <= 0) break
        const take = Math.min(bucket.amount, want)
        sum += take * bucket.unitValue
        want -= take
    }
    return round2(sum)
}

// Authoritative validation shared with the server endpoint.
export function validateRefundRequest(order, items = [], shippingAmount = 0) {
    const errors = []
    const list = Array.isArray(items) ? items : []
    const ship = round2(Number(shippingAmount || 0))
    if (ship < 0) errors.push('Invalid shipping refund amount')
    let itemsTotal = 0
    const cartById = new Map((order?.cart || []).map(l => [String(l.id), l]))
    const cartByBarcode = new Map((order?.cart || []).map(l => [String(l.barcode), l]))
    for (const it of list) {
        const line = cartById.get(String(it.productId)) || cartByBarcode.get(String(it.productId))
        if (!line) {
            errors.push(`Product ${it.productId} not in order`)
            continue
        }
        if (line.missing || lineAvailableQty(line) <= 0) {
            errors.push(`Product ${line.name || it.productId} was not supplied and cannot be refunded`)
            continue
        }
        const req = round2(Number(it.amount || 0))
        if (!(req > 0)) {
            errors.push(`Invalid amount for ${line.name || it.productId}`)
            continue
        }
        itemsTotal = round2(itemsTotal + req)
        const max = lineMaxRefundable(line, order)
        if (req - max > REFUND_EPS) errors.push(`Refund for ${line.name || it.productId} exceeds remaining (${max})`)
    }
    if (ship > 0) {
        const maxShip = shippingRemaining(order)
        if (ship - maxShip > REFUND_EPS) errors.push(`Shipping refund exceeds remaining (${maxShip})`)
    }
    const totalRefund = round2(itemsTotal + ship)
    if (!(totalRefund > 0)) errors.push('Refund total must be > 0')
    const remaining = getRemaining(order)
    if (totalRefund - remaining > REFUND_EPS) errors.push(`Refund exceeds remaining amount (${remaining})`)
    return { totalRefund, remaining, errors }
}

// Audit rows for an order-level remainder refund (cancel fallback, auto-retry):
// every line's still-refundable share + shipping remainder, same item shape
// as payment/refund (shipping as the __shipping pseudo-item).
export function remainderRefundItems(order) {
    const items = []
    for (const line of (order?.cart || [])) {
        if (line?.missing || lineAvailableQty(line) <= 0) continue
        const max = lineMaxRefundable(line, order)
        if (max > 0) {
            items.push({
                productId: String(line.id || line.barcode),
                barcode: line.barcode,
                name: line.name,
                amount: max
            })
        }
    }
    const ship = shippingRemaining(order)
    if (ship > 0) items.push({ productId: '__shipping', name: 'shipping', amount: ship })
    return items
}
