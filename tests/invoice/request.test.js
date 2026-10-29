import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeInvoiceRequest, INVOICE_ERRORS } from '../../common/functions/invoice/request.js'

describe('normalizeInvoiceRequest', () => {
    it('keeps "no input" distinct from "clear"', () => {
        assert.equal(normalizeInvoiceRequest(undefined).value, undefined)
        assert.equal(normalizeInvoiceRequest(null).value, null)
        assert.equal(normalizeInvoiceRequest({}).value, null)
        assert.equal(normalizeInvoiceRequest({ required: false }).value, null)
    })

    it('normalizes a company request', () => {
        const { value, errors } = normalizeInvoiceRequest({
            required: true,
            taxId: ' 514-123-456 ',
            companyName: '  Shopik   Ltd ',
            email: ' Billing@Example.COM ',
            note: 'Please\nsend it'
        })
        assert.deepEqual(errors, [])
        assert.deepEqual(value, {
            required: true,
            taxId: '514123456',
            companyName: 'Shopik Ltd',
            email: 'billing@example.com',
            note: 'Please send it'
        })
    })

    it('requires a customer number when a tax invoice is requested', () => {
        const { value, errors } = normalizeInvoiceRequest({ required: true, companyName: 'ACME' })
        assert.equal(value.required, true)
        assert.deepEqual(errors, [INVOICE_ERRORS.TAX_ID_REQUIRED])
    })

    it('rejects a malformed customer number and email', () => {
        const { errors } = normalizeInvoiceRequest({
            required: true,
            taxId: '12ab',
            email: 'not-an-email'
        })
        assert.deepEqual(errors, [INVOICE_ERRORS.TAX_ID_INVALID, INVOICE_ERRORS.EMAIL_INVALID])
    })

    it('never blocks an order that did not ask for a tax invoice', () => {
        const { value, errors } = normalizeInvoiceRequest({ note: 'call before delivery' })
        assert.deepEqual(errors, [])
        assert.equal(value.required, false)
    })

    it('treats a string "true" from form data as required', () => {
        const { value } = normalizeInvoiceRequest({ required: 'true', taxId: '514123456' })
        assert.equal(value.required, true)
    })
})
