import { round2 } from '../calcOrder/utils.js'
import { cleanText, formatQuantity } from './format.js'

export const DEFAULT_NOTE_LIMIT = 5
export const DEFAULT_NOTE_LENGTH = 500

function findReplacement(cart, line) {
    const barcode = line?.barcode
    const byLink = (cart || []).find(l => l && !l.missing && l.replacement?.originalBarcode && l.replacement.originalBarcode === barcode)
    if (byLink) return byLink
    const fallbackBarcode = line?.replacedBy || line?.replacement?.replacementBarcode
    if (!fallbackBarcode) return null
    return (cart || []).find(l => l && !l.missing && l.barcode === fallbackBarcode) || null
}

function isReplacedLine(line) {
    return Boolean(line) && (
        line.missingReason === 'replaced'
        || Boolean(line.replacedBy)
        || Boolean(line.replacement?.replacementBarcode)
    )
}

function replacementEntry(cart, line) {
    const replacement = findReplacement(cart, line)
    if (!replacement) return null
    const from = [cleanText(line.name, 120), formatQuantity(line.amount, line.unit)].filter(Boolean).join(' ')
    const to = [cleanText(replacement.name, 120), formatQuantity(replacement.finalAmount ?? replacement.amount, replacement.unit)].filter(Boolean).join(' ')
    return `הוחלף: ${from} → ${to}`
}

function missingEntry(line) {
    const name = cleanText(line.name, 120)
    const qty = formatQuantity(line.amount, line.unit)
    return `לא סופק: ${[name, qty].filter(Boolean).join(' ')}`
}

function couponEntries(coupons) {
    return (coupons || [])
        .filter(c => c && Number(c.discount) > 0)
        .map(c => {
            const name = cleanText(c.name || c.code || c.title || c.couponName, 80)
            const amount = round2(Number(c.discount)).toFixed(2)
            return name ? `קופון ${name}: -${amount}` : `קופון: -${amount}`
        })
}

/**
 * The note printed on the invoice (`comment` in the EZcount payload).
 *
 * It describes what changed between the order and what was actually supplied:
 * replacements, items that were not supplied, and the coupon discount that was
 * already allocated across the line prices. Raw picker data (`missingReason`,
 * picker names) never reaches the document.
 *
 * Capped at `maxLines` entries plus a pointer to the order; the EZcount comment
 * length limit is still unverified, so the total length is capped too.
 *
 * @returns {string} empty string when there is nothing to say
 */
export function buildInvoiceNotes({
    cart = [],
    coupons = [],
    orderNumber,
    include = {},
    maxLines = DEFAULT_NOTE_LIMIT,
    maxLength = DEFAULT_NOTE_LENGTH
} = {}) {
    const wanted = { replaced: true, missing: true, coupon: true, ...include }
    const entries = []

    if (wanted.replaced) {
        for (const line of cart || []) {
            if (!line?.missing) continue
            if (!isReplacedLine(line)) continue
            const entry = replacementEntry(cart, line)
            // A replaced original whose replacement line is gone is not a
            // replacement any more — fall through to the missing wording.
            if (entry) entries.push(entry)
            else if (wanted.missing) entries.push(missingEntry(line))
        }
    }

    if (wanted.missing) {
        for (const line of cart || []) {
            if (!line?.missing || isReplacedLine(line)) continue
            entries.push(missingEntry(line))
        }
    }

    if (wanted.coupon) entries.push(...couponEntries(coupons))

    if (!entries.length) return ''

    const summary = orderNumber != null && String(orderNumber).trim()
        ? `פרטים מלאים בהזמנה ${String(orderNumber).trim()}`
        : ''

    const kept = []
    let truncated = false
    for (const entry of entries) {
        if (kept.length >= maxLines) { truncated = true; break }
        const next = [...kept, entry]
        const withSummary = summary ? [...next, summary] : next
        if (withSummary.join('\n').length > maxLength) { truncated = true; break }
        kept.push(entry)
    }

    if (truncated && summary) kept.push(summary)
    return kept.join('\n')
}
