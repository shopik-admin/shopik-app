import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import filterClientOrder from '../../server/utils/data/filterClientOrder.js'

const order = () => ({
    id: 'o1',
    number: 1001,
    status: 'cart',
    cart: [{ id: 'p1', name: 'Milk', barcode: '1', amount: 2, totalSum: 20, vat: false, adminNote: 'x' }],
    invoiceRequest: { required: true, taxId: '514123456', companyName: 'Shopik Ltd' },
    payment: { cardToken: 'secret', terminalId: 't', last4digits: '1234' }
})

describe('filterClientOrder invoice fields', () => {
    it('keeps the checkout billing details so a cart refresh does not wipe them', () => {
        const filtered = filterClientOrder(order())
        assert.deepEqual(filtered.invoiceRequest, {
            required: true, taxId: '514123456', companyName: 'Shopik Ltd'
        })
    })

    it('never exposes the internal VAT snapshot on cart lines', () => {
        const filtered = filterClientOrder(order())
        // The server rebuilds the cart from the DB; the client must not be able
        // to influence or read the tax classification.
        assert.equal(filtered.cart[0].vat, undefined)
        assert.equal(filtered.cart[0].adminNote, undefined)
    })

    it('still strips payment secrets', () => {
        const filtered = filterClientOrder(order())
        assert.deepEqual(filtered.payment, { last4digits: '1234' })
    })
})
