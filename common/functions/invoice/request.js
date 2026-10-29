import { cleanText } from './format.js'

// Israeli ת.ז / ח.פ / עוסק number: 9 digits, sometimes typed with a hyphen.
// Kept deliberately loose (8 digits allowed) so a legacy company number is not
// rejected at checkout — the accountant sees the value on the document.
const TAX_ID_RE = /^\d{8,9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const INVOICE_ERRORS = {
    TAX_ID_REQUIRED: 'invoice_tax_id_required',
    TAX_ID_INVALID: 'invoice_tax_id_invalid',
    EMAIL_INVALID: 'invoice_email_invalid'
}

/**
 * Normalize the checkout invoice request.
 *
 * `undefined` means "the client said nothing about billing" — the caller keeps
 * whatever is already stored. `null` means "explicitly no invoice details" and
 * clears the request. Validation only applies to values the customer actually
 * asked to put on the document, so a plain order with no billing fields never
 * blocks payment.
 *
 * @returns {{ value: object|null, errors: string[] }}
 */
export function normalizeInvoiceRequest(input) {
    if (input === undefined) return { value: undefined, errors: [] }
    if (input === null || typeof input !== 'object' || Array.isArray(input))
        return { value: null, errors: [] }

    const required = input.required === true || input.required === 'true'
    const value = {
        required,
        taxId: String(input.taxId ?? '').replace(/[\s-]/g, '').trim(),
        companyName: cleanText(input.companyName, 100),
        email: cleanText(input.email, 120).toLowerCase(),
        note: cleanText(input.note, 200)
    }

    const meaningful = value.required || value.taxId || value.companyName || value.email || value.note
    if (!meaningful) return { value: null, errors: [] }

    const errors = []
    if (value.taxId && !TAX_ID_RE.test(value.taxId)) errors.push(INVOICE_ERRORS.TAX_ID_INVALID)
    if (value.email && !EMAIL_RE.test(value.email)) errors.push(INVOICE_ERRORS.EMAIL_INVALID)
    // An explicit tax-invoice request without a customer number cannot be
    // printed legally for a business, so block it at checkout instead of
    // discovering it at issuance time.
    if (value.required && !value.taxId) errors.push(INVOICE_ERRORS.TAX_ID_REQUIRED)

    return { value, errors }
}
