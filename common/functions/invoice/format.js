import { round2 } from '../calcOrder/utils.js'

// Invoice descriptions and notes are free text inside a legal document: keep
// them single-line, control-character free and short enough for EZcount.
export function cleanText(value, maxLength = 200) {
    const text = String(value ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    if (!maxLength || text.length <= maxLength) return text
    return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…'
}

function formatNumber(value) {
    const n = round2(Number(value) || 0)
    return Number.isInteger(n) ? String(n) : String(n)
}

// Human-readable quantity for a cart line (the invoice row itself is always
// quantity 1 + the exact charged gross — see invoice lines).
export function formatQuantity(amount, unit) {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return ''
    const num = formatNumber(n)
    const base = unit?.baseUnit
    if (base === 'kg') return `${num} ק"ג`
    if (base === 'g') return `${num} ג'`
    return `${num} יח'`
}

export function describeInvoiceLine(line = {}) {
    const name = cleanText(line.name, 160) || 'פריט'
    const qty = formatQuantity(line.quantity ?? line.amount, line.unit)
    return qty ? `${name} (${qty})` : name
}
