import { round2 } from '../calcOrder/utils.js'

// Money tolerance for the document ↔ charge reconciliation (half an agora).
export const INVOICE_EPS = 0.005

/**
 * Order-level coupon total. Mirrors pick_complete: `finalSum = sum - coupons`,
 * so the invoice must spend exactly this discount across the served lines.
 */
export function couponTotalOf(coupons = []) {
    return round2((coupons || []).reduce((acc, c) => acc + (Number(c?.discount) || 0), 0))
}

/**
 * A line belongs on the tax invoice only if it was actually supplied and
 * charged. Missing lines and replaced originals were never charged
 * (pick_complete zeroes them and excludes them from `sum`), so they must not
 * appear — not as a zero row and not as a discount.
 */
export function isInvoiceLine(line) {
    if (!line) return false
    if (line.missing) return false
    if (line.replacedBy) return false
    const quantity = Number(line.finalAmount ?? line.amount ?? 0)
    const gross = Number(line.totalSum ?? 0)
    return quantity > 0 && gross > 0
}

export function collectInvoiceItems(cart = []) {
    return (cart || [])
        .filter(isInvoiceLine)
        .map(line => ({
            productId: line.id,
            barcode: line.barcode,
            name: line.name,
            quantity: Number(line.finalAmount ?? line.amount ?? 0),
            gross: round2(Number(line.totalSum) || 0),
            // undefined (legacy snapshot) is taxable, matching product.vat default
            vat: line.vat !== false,
            unit: line.unit ? { type: line.unit.type, baseUnit: line.unit.baseUnit } : undefined
        }))
}

/**
 * Spread the coupon over the included lines proportionally to their gross.
 *
 * The whole discount has to be spent inside the item rows: EZcount only
 * receives prices, and a separate negative row would need one vat_type for the
 * entire discount, which is wrong for a mixed basket (see plan §6.4).
 *
 * Rounding is applied per line; the largest line absorbs the leftover agorot so
 * the rows sum to the coupon exactly and no small line can go negative.
 */
export function allocateCoupon({ items = [], couponTotal = 0 } = {}) {
    const total = round2(items.reduce((acc, item) => acc + item.gross, 0))
    const coupon = round2(Math.min(Math.max(Number(couponTotal) || 0, 0), total))

    if (!(coupon > 0) || !(total > 0))
        return items.map(item => ({ ...item, discount: 0, gross: round2(item.gross) }))

    let largest = 0
    for (let i = 1; i < items.length; i++)
        if (items[i].gross > items[largest].gross) largest = i

    const discounts = items.map(item => round2(coupon * item.gross / total))
    const drift = round2(coupon - discounts.reduce((acc, d) => acc + d, 0))
    if (drift !== 0) {
        const target = items[largest].gross
        discounts[largest] = round2(Math.min(Math.max(discounts[largest] + drift, 0), target))
    }

    return items.map((item, i) => ({
        ...item,
        discount: discounts[i],
        gross: round2(item.gross - discounts[i])
    }))
}

/**
 * Shipping is a taxable service line, always separate from the goods and never
 * discounted by the coupon (shipping is computed on the pre-coupon sum).
 */
export function buildShippingLine(shipping = 0, { name = 'משלוח' } = {}) {
    const amount = round2(Number(shipping) || 0)
    if (!(amount > 0)) return null
    return { productId: '__shipping', barcode: null, name, quantity: 1, gross: amount, price: amount, vat: true, discount: 0 }
}

/**
 * Compute the effective unit price for a line.
 * If rounding to 2 decimals would cause quantity * price to overshoot the line gross,
 * we floor to 2 decimal places so that quantity * price <= gross.
 * This guarantees that across all lines, the computed total is <= charged,
 * meaning any rounding drift is always >= 0 (never negative).
 */
export function computeUnitPrice(gross, quantity) {
    const q = Number(quantity) || 0
    const g = round2(Number(gross) || 0)
    if (!(q > 0)) return g
    const raw = g / q
    const rounded = round2(raw)
    if (round2(q * rounded) > g) {
        return round2(Math.floor((raw + 1e-9) * 100) / 100)
    }
    return rounded
}

/**
 * Rounding adjustment line. Appended when line-level (quantity * price)
 * rounding produces a residual difference against the captured total.
 */
export function buildRoundingLine(drift = 0, { name = 'הפרשי עיגול' } = {}) {
    const amount = round2(Number(drift) || 0)
    if (!(amount > 0)) return null
    return {
        productId: '__rounding',
        barcode: null,
        name,
        quantity: 1,
        gross: amount,
        price: amount,
        vat: true,
        discount: 0
    }
}

/**
 * The invoice body: served lines after coupon + shipping + rounding reconciliation.
 * `order.finalShipping` is written by captureOrder and is the amount charged.
 */
export function buildInvoiceLines({ order, settings = {} } = {}) {
    const rawItems = allocateCoupon({
        items: collectInvoiceItems(order?.cart),
        couponTotal: couponTotalOf(order?.coupons)
    })
    const items = rawItems.map(item => ({
        ...item,
        price: computeUnitPrice(item.gross, item.quantity)
    }))
    const shipping = round2(Number(order?.finalShipping ?? order?.shipping ?? 0) || 0)
    const shippingLine = buildShippingLine(shipping, { name: settings.shippingLabel })

    const invoicedItemsGross = round2(items.reduce((acc, item) => acc + round2(item.quantity * item.price), 0))
    const totalWithoutRounding = round2(invoicedItemsGross + (shippingLine?.gross || 0))
    const targetTotal = round2(rawItems.reduce((acc, item) => acc + item.gross, 0) + shipping)
    const drift = round2(targetTotal - totalWithoutRounding)
    const roundingLine = buildRoundingLine(drift, { name: settings.roundingLabel })

    const total = round2(totalWithoutRounding + (roundingLine?.gross || 0))
    return { items, shippingLine, roundingLine, shipping, total, drift, coupon: couponTotalOf(order?.coupons) }
}

export function invoiceTotal({ items = [], shippingLine, roundingLine } = {}) {
    const itemsSum = round2(items.reduce((acc, item) => {
        const q = Number(item.quantity ?? 1)
        const p = item.price != null ? Number(item.price) : round2(Number(item.gross) / q)
        return acc + round2(q * p)
    }, 0))
    const ship = shippingLine ? round2((Number(shippingLine.quantity) || 1) * (shippingLine.price != null ? Number(shippingLine.price) : Number(shippingLine.gross) || 0)) : 0
    const round = roundingLine ? round2((Number(roundingLine.quantity) || 1) * (roundingLine.price != null ? Number(roundingLine.price) : Number(roundingLine.gross) || 0)) : 0
    return round2(itemsSum + ship + round)
}

/**
 * Credit-note rows. The refund engine works with amounts only
 * (`{ productId, barcode, name, amount }`), so the VAT class is looked up from
 * the order line snapshot; shipping is always taxable.
 */
export function buildCreditLines({ refundItems = [], cart = [] } = {}) {
    const byId = new Map()
    const byBarcode = new Map()
    for (const line of cart || []) {
        if (!line) continue
        if (line.id != null) byId.set(String(line.id), line)
        if (line.barcode != null) byBarcode.set(String(line.barcode), line)
    }

    return (refundItems || [])
        .filter(item => item && Number(item.amount) > 0)
        .map(item => {
            const shipping = item.productId === '__shipping'
            const line = shipping
                ? null
                : (byId.get(String(item.productId)) || byBarcode.get(String(item.productId)) || byBarcode.get(String(item.barcode)))
            const amount = round2(Number(item.amount))
            return {
                productId: item.productId,
                barcode: item.barcode ?? line?.barcode,
                name: shipping ? (item.name || 'משלוח') : (item.name || line?.name || 'פריט'),
                quantity: 1,
                gross: amount,
                price: amount,
                vat: shipping ? true : (typeof item.vat === 'boolean' ? item.vat : line?.vat !== false),
                unit: line?.unit ? { type: line.unit.type, baseUnit: line.unit.baseUnit } : undefined
            }
        })
}

/**
 * The document total must equal the captured amount. This is the only hard
 * assertion in the flow: a mismatch means the wrong rows would be invoiced.
 */
export function assertTotalsMatch({ items = [], shippingLine, roundingLine, captured } = {}) {
    const total = invoiceTotal({ items, shippingLine, roundingLine })
    const charged = round2(Number(captured) || 0)
    if (Math.abs(total - charged) > INVOICE_EPS) {
        const error = new Error(`invoice total ${total} does not match captured ${charged}`)
        error.code = 'INVOICE_TOTALS_MISMATCH'
        error.total = total
        error.captured = charged
        throw error
    }
    return total
}
