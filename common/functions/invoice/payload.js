import { round2 } from '../calcOrder/utils.js'
import { cleanText, describeInvoiceLine } from './format.js'

// EZcount document types (see the API docs; configurable in the Setting).
export const DOC_TYPE = {
    INVOICE: 320,   // חשבונית מס קבלה
    CREDIT: 330     // חשבונית זיכוי
}

// EZcount item VAT type: INC = VAT included / shown, NON = exempt.
export const VAT_TYPE = {
    TAXABLE: 'INC',
    EXEMPT: 'NON'
}

export function vatTypeOf(vat) {
    return vat === false ? VAT_TYPE.EXEMPT : VAT_TYPE.TAXABLE
}

/**
 * One EZcount item row.
 *
 * `amount` is always 1 and `price` is the exact gross charged for the line:
 * quantities are rounded/weighted in the cart and a quantity × price product
 * would not reproduce the charged total. The real quantity is part of the
 * description, so the document stays auditable.
 */
export function buildInvoiceItem(line = {}) {
    return {
        details: describeInvoiceLine(line),
        amount: '1',
        price: round2(Number(line.gross) || 0).toFixed(2),
        vat_type: vatTypeOf(line.vat)
    }
}

export function buildInvoiceItems(lines = []) {
    return (lines || [])
        .filter(line => line && Number(line.gross) > 0)
        .map(buildInvoiceItem)
}

function customerName(customer = {}, order = {}) {
    if (typeof customer.fullName === 'string' && customer.fullName.trim())
        return cleanText(customer.fullName, 100)
    const fromParts = [customer.name?.first, customer.name?.last].filter(Boolean).join(' ')
    const plain = typeof customer.name === 'string' ? customer.name : ''
    return cleanText(fromParts || plain || order.name, 100)
}

/**
 * The EZcount `createDoc` body (credentials are added by the client).
 *
 * Only document fields are ever sent — never card or payment fields, so the
 * provider can never settle a charge.
 */
export function buildDocPayload({
    order = {},
    lines = [],
    docType = DOC_TYPE.INVOICE,
    customer = {},
    notes = '',
    settings = {},
    sendEmail = true,
    idTransaction
} = {}) {
    const email = cleanText(customer.email || order.email, 120)
    const payload = {
        type: docType,
        lang: settings.language || 'he',
        customer_name: customerName(customer, order),
        item: buildInvoiceItems(lines)
    }

    if (email) {
        payload.customer_email = email
        payload.dont_send_email = sendEmail ? 'false' : 'true'
    } else {
        // EZcount requires customer_email when sending; without one we create
        // the document and leave delivery to the account link.
        payload.dont_send_email = 'true'
    }

    const phone = cleanText(customer.phone || order.phone, 30)
    if (phone) payload.customer_phone = phone

    const taxId = cleanText(customer.taxId || order.invoiceRequest?.taxId, 20)
    if (taxId) payload.customer_crn = taxId

    const address = cleanText(customer.address, 60)
    if (address) payload.customer_address = address

    if (notes) payload.comment = notes
    if (idTransaction) payload.id_transaction = String(idTransaction)

    return payload
}
