import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildDocPayload, buildInvoiceItems, vatTypeOf, DOC_TYPE, VAT_TYPE } from '../../common/functions/invoice/payload.js'
import { readVatSummary } from '../../common/functions/invoice/summary.js'

const lines = [
    { name: 'Tomatoes', gross: 45, vat: false, quantity: 2, unit: { baseUnit: 'kg' } },
    { name: 'Milk 3%', gross: 90, vat: true, quantity: 3, unit: { baseUnit: 'unit' } },
    { name: 'Shipping', gross: 20, vat: true, quantity: 1 }
]

describe('vatTypeOf', () => {
    it('maps exempt to NON and everything else to INC', () => {
        assert.equal(vatTypeOf(false), VAT_TYPE.EXEMPT)
        assert.equal(vatTypeOf(true), VAT_TYPE.TAXABLE)
        assert.equal(vatTypeOf(undefined), VAT_TYPE.TAXABLE)
    })
})

describe('buildInvoiceItems', () => {
    it('sends quantity 1 with the exact charged gross as the price', () => {
        const items = buildInvoiceItems(lines)
        assert.deepEqual(items.map(i => i.amount), ['1', '1', '1'])
        assert.deepEqual(items.map(i => i.price), ['45.00', '90.00', '20.00'])
    })

    it('carries the VAT class per line', () => {
        const items = buildInvoiceItems(lines)
        assert.deepEqual(items.map(i => i.vat_type), ['NON', 'INC', 'INC'])
    })

    it('keeps the real quantity in the description', () => {
        const items = buildInvoiceItems(lines)
        assert.equal(items[0].details, 'Tomatoes (2 ק"ג)')
        assert.equal(items[1].details, 'Milk 3% (3 יח\')')
    })

    it('drops zero-gross lines', () => {
        assert.equal(buildInvoiceItems([{ name: 'Zero', gross: 0 }]).length, 0)
    })
})

describe('buildDocPayload', () => {
    const order = { number: 12345, name: 'Order Name', phone: '0501234567', email: 'order@example.com' }
    const customer = { name: { first: 'Dana', last: 'Levi' }, email: 'dana@example.com', taxId: '514123456' }

    it('builds a 320 tax invoice receipt payload', () => {
        const payload = buildDocPayload({ order, lines, customer, idTransaction: 'invoice:o1' })
        assert.equal(payload.type, DOC_TYPE.INVOICE)
        assert.equal(payload.type, 320)
        assert.equal(payload.customer_name, 'Dana Levi')
        assert.equal(payload.customer_email, 'dana@example.com')
        assert.equal(payload.customer_phone, '0501234567')
        assert.equal(payload.customer_crn, '514123456')
        assert.equal(payload.dont_send_email, 'false')
        assert.equal(payload.lang, 'he')
        assert.equal(payload.id_transaction, 'invoice:o1')
        assert.equal(payload.item.length, 3)
    })

    it('uses the credit type and records the original document in the note', () => {
        const payload = buildDocPayload({
            order, lines, customer, docType: DOC_TYPE.CREDIT,
            notes: 'זיכוי לחשבונית 30012'
        })
        assert.equal(payload.type, 330)
        assert.equal(payload.comment, 'זיכוי לחשבונית 30012')
    })

    it('never sends payment or card fields', () => {
        const payload = buildDocPayload({ order, lines, customer })
        const keys = Object.keys(payload)
        assert.equal(keys.some(k => /card|token|terminal|payment|cvv/i.test(k)), false)
        assert.equal(keys.includes('item'), true)
    })

    it('does not ask EZcount to send when there is no email', () => {
        const payload = buildDocPayload({ order: { number: 1 }, lines })
        assert.equal(payload.dont_send_email, 'true')
        assert.equal(payload.customer_email, undefined)
    })

    it('omits the comment when there are no notes', () => {
        const payload = buildDocPayload({ order, lines, customer, notes: '' })
        assert.equal('comment' in payload, false)
    })

    it('applies the configured language and email flag', () => {
        const payload = buildDocPayload({
            order, lines, customer,
            settings: { language: 'en' }, sendEmail: false
        })
        assert.equal(payload.lang, 'en')
        assert.equal(payload.dont_send_email, 'true')
    })
})

describe('readVatSummary', () => {
    it('copies the provider numbers without recomputing them', () => {
        assert.deepEqual(readVatSummary({ total: 155, vat: 16.78, net: 138.22 }), {
            total: 155, vat: 16.78, net: 138.22
        })
    })

    it('returns partial data as-is', () => {
        assert.deepEqual(readVatSummary({ data: { total_amount: '155.00' } }), {
            total: 155, vat: undefined, net: undefined
        })
    })

    it('returns null when the provider sent no breakdown', () => {
        assert.equal(readVatSummary({ success: true, doc_number: '30012' }), null)
    })
})
