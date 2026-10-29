export const REFUND_REASONS_KEY = 'refund_reasons'
export const REFUND_ALLOW_OTHER_KEY = 'refund_allow_other'
export const REFUND_REASONS_CATEGORY = 'orders'
export const REFUND_REASONS_SUB_CATEGORY = 'refunds'

// Special option value; never stored as a reason text.
export const REFUND_REASON_OTHER = '__other'

export const DEFAULT_REFUND_REASONS = [
    'טעות בהזמנה',
    'מוצר פגום',
    'מוצר חסר',
    'ביטול פריט',
    'פיצוי ללקוח',
]

// The setting is edited as one reason per line (textarea).
export function parseRefundReasons(value) {
    if (Array.isArray(value)) return dedupe(value)
    if (typeof value !== 'string') return []
    return dedupe(value.split(/\r?\n/))
}

export function parseSettingBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const text = String(value).trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(text)) return true
    if (['false', '0', 'no', 'off'].includes(text)) return false
    return fallback
}

function dedupe(list) {
    const out = []
    for (const raw of list) {
        const reason = String(raw ?? '').trim()
        if (reason && !out.includes(reason)) out.push(reason)
    }
    return out
}
