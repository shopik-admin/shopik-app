import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import pick_item from '../../server/api/order/ops/pick_item.js'
import pick_complete from '../../server/api/order/ops/pick_complete.js'

const ADMIN = { id: 'a1', name: { first: 'Pick', last: 'Er' } }

// A cart line as the pick routes read it: only what the pair rule and the pricing
// engine look at.
function line({ id, barcode, status = 'client_add', unit = { type: 'unit' }, ...rest }) {
    return { id, barcode, status, unit, ...rest }
}

function harness(order, { product = null } = {}) {
    const calls = { pairUpdates: [] }
    const DL = {
        Order: {
            readById: async () => order,
            updateOne: async (filter, update) => {
                calls.orderUpdate = update
                return { ...order, ...(update.$set || {}) }
            },
            Model: {
                // The pair side: pull (a line that exists only because of the
                // replacement) or unset (a line the customer ordered).
                updateOne: async (filter, update, opts) => {
                    if (update.$pull) calls.pull = update.$pull
                    else calls.partnerUnset = update.$unset
                    calls.pairUpdates.push({ update, arrayFilters: opts?.arrayFilters })
                    return order
                },
                // Not async: the route calls it as mongoose does, `.lean()` on the
                // returned document.
                findOneAndUpdate: (filter, update) => {
                    calls.itemUpdate = update
                    return { lean: () => order }
                }
            }
        },
        Product: { readOne: async () => product },
        Setting: { readOne: async () => null },
        PickHistory: { create: async () => {} },
        Sale: { read: async () => [] }
    }
    // enrichCart returns early without DL.Product.Model, so the fake stays out of it.
    return { DL, calls }
}

const pick = (payload, DL) => pick_item(payload, { DL, _admin: ADMIN, utils: {} })

describe('pick_item keeps a replacement pair whole', () => {
    it('a replaced line recorded as plain missing loses its replacement status, and the added line goes with it', async () => {
        const order = {
            id: 'o1', status: 'picking', picker: { adminId: ADMIN.id },
            cart: [
                line({ id: 'p1', barcode: 'A', amount: 2, missing: true, missingReason: 'replaced', replacement: { replacementBarcode: 'B' } }),
                line({ id: 'p2', barcode: 'B', status: 'admin_add', amount: 2, finalAmount: 2, replacement: { originalBarcode: 'A' } })
            ]
        }
        const { DL, calls } = harness(order)
        await pick({ id: 'o1', barcode: 'A', action: 'missing' }, DL)

        assert.equal(calls.itemUpdate.$set['cart.$[elem].missingReason'], 'missing')
        assert.equal(calls.itemUpdate.$unset['cart.$[elem].replacement'], '')
        assert.equal(calls.itemUpdate.$unset['cart.$[elem].replacedBy'], '')
        assert.deepEqual(calls.pull.cart, { barcode: 'B', 'replacement.originalBarcode': 'A' })
    })

    it('a partner the customer ordered keeps its own line, only its link is cleared', async () => {
        const order = {
            id: 'o1', status: 'picking', picker: { adminId: ADMIN.id },
            cart: [
                line({ id: 'p1', barcode: 'A', amount: 2, missing: true, missingReason: 'replaced', replacement: { replacementBarcode: 'B' } }),
                line({ id: 'p2', barcode: 'B', amount: 2, finalAmount: 2, replacement: { originalBarcode: 'A' } })
            ]
        }
        const { DL, calls } = harness(order)
        await pick({ id: 'o1', barcode: 'A', action: 'missing' }, DL)

        assert.equal(calls.pull, undefined)
        assert.deepEqual(calls.partnerUnset, { 'cart.1.replacement': '', 'cart.1.replacedBy': '' })
    })

    it('scanning a replaced product that was found after all clears the pair', async () => {
        const order = {
            id: 'o1', status: 'picking', picker: { adminId: ADMIN.id },
            cart: [
                line({ id: 'p1', barcode: 'A', amount: 2, missing: true, missingReason: 'replaced', replacement: { replacementBarcode: 'B' } }),
                line({ id: 'p2', barcode: 'B', status: 'admin_add', amount: 2, finalAmount: 2, replacement: { originalBarcode: 'A' } })
            ]
        }
        const { DL, calls } = harness(order)
        await pick({ id: 'o1', barcode: 'A', action: 'scan', finalAmount: 2 }, DL)

        assert.equal(calls.itemUpdate.$set['cart.$[elem].missing'], false)
        assert.equal(calls.itemUpdate.$unset['cart.$[elem].replacement'], '')
        assert.deepEqual(calls.pull.cart, { barcode: 'B', 'replacement.originalBarcode': 'A' })
    })

    it('scanning the replacement line itself leaves the pair standing', async () => {
        const order = {
            id: 'o1', status: 'picking', picker: { adminId: ADMIN.id },
            cart: [
                line({ id: 'p1', barcode: 'A', amount: 2, missing: true, missingReason: 'replaced', replacement: { replacementBarcode: 'B' } }),
                line({ id: 'p2', barcode: 'B', status: 'admin_add', amount: 2, finalAmount: 2, replacement: { originalBarcode: 'A' } })
            ]
        }
        const { DL, calls } = harness(order)
        await pick({ id: 'o1', barcode: 'B', action: 'scan', finalAmount: 2 }, DL)

        assert.equal(calls.pull, undefined)
        assert.equal(calls.partnerUnset, undefined)
        assert.equal(calls.itemUpdate.$unset, undefined)
    })

    it('reset clears the pair and the pricing view of it', async () => {
        const order = {
            id: 'o1', status: 'picking', picker: { adminId: ADMIN.id },
            cart: [
                line({ id: 'p1', barcode: 'A', amount: 2, missing: true, missingReason: 'replaced', replacedBy: 'B', replacement: { replacementBarcode: 'B' } }),
                line({ id: 'p2', barcode: 'B', status: 'admin_add', amount: 2, finalAmount: 2, replacement: { originalBarcode: 'A' } })
            ]
        }
        const { DL, calls } = harness(order)
        await pick({ id: 'o1', barcode: 'A', action: 'reset' }, DL)

        assert.deepEqual(calls.pull.cart, { barcode: 'B', 'replacement.originalBarcode': 'A' })
        assert.equal(calls.itemUpdate.$unset['cart.$[elem].replacedBy'], '')
        assert.equal(calls.itemUpdate.$unset['cart.$[elem].missingReason'], '')
    })

    it('returning a replacement to pick removes the line the picker added', async () => {
        // The link is matched as a field, not as a whole document: a stored
        // replacement also carries its suggestion list, so a value holding only the
        // barcode it points at never equals the line and nothing is pulled.
        const order = {
            id: 'o1', status: 'picking', picker: { adminId: ADMIN.id },
            cart: [
                line({ id: 'p1', barcode: 'A', amount: 2, missing: true, missingReason: 'replaced', replacement: { replacementBarcode: 'B' } }),
                line({ id: 'p2', barcode: 'B', status: 'admin_add', amount: 2, finalAmount: 2, replacement: { originalBarcode: 'A' } })
            ]
        }
        const { DL, calls } = harness(order)
        await pick({ id: 'o1', barcode: 'B', action: 'reset' }, DL)

        assert.deepEqual(calls.pull.cart, { barcode: 'B', 'replacement.originalBarcode': 'A' })

        // The clicked line is the one removed, so the only line left to put back to
        // picking is the product the customer ordered.
        const resetLine = calls.pairUpdates.find(u => u.update.$set)
        assert.deepEqual(resetLine.arrayFilters, [{ 'elem.barcode': 'A' }])
        assert.equal(resetLine.update.$set['cart.$[elem].missing'], false)
        assert.equal(resetLine.update.$unset['cart.$[elem].finalAmount'], '')
    })

    it('returning to pick on a replacement the customer ordered keeps that line', async () => {
        const order = {
            id: 'o1', status: 'picking', picker: { adminId: ADMIN.id },
            cart: [
                line({ id: 'p1', barcode: 'A', amount: 2, missing: true, missingReason: 'replaced', replacement: { replacementBarcode: 'B' } }),
                line({ id: 'p2', barcode: 'B', amount: 2, finalAmount: 2, replacement: { originalBarcode: 'A' } })
            ]
        }
        const { DL, calls } = harness(order)
        await pick({ id: 'o1', barcode: 'B', action: 'reset' }, DL)

        assert.equal(calls.pull, undefined)
        // Both sides go back to picking; what the pair loses is the link, not the line.
        assert.deepEqual(calls.pairUpdates[0].arrayFilters, [{ 'elem.barcode': 'A' }])
        assert.equal(calls.itemUpdate.$unset['cart.$[elem].replacement'], '')
    })
})

describe('pick_complete only records a replacement when the pair is whole', () => {
    it('a replaced original with no replacement line is priced as a stock-out', async () => {
        const order = {
            id: 'o1', status: 'picking', picker: { adminId: ADMIN.id }, cart: [
                line({ id: 'p1', barcode: 'A', amount: 2, price: 10, missing: true, missingReason: 'replaced', replacedBy: 'B' })
            ]
        }
        const { DL, calls } = harness(order)
        await pick_complete({ id: 'o1' }, { DL, _admin: ADMIN, utils: {} })

        assert.equal(calls.orderUpdate.$set.cart[0].replacedBy, undefined)
    })

    it('a whole pair keeps its replacement link', async () => {
        const order = {
            id: 'o1', status: 'picking', picker: { adminId: ADMIN.id }, cart: [
                line({ id: 'p1', barcode: 'A', amount: 2, price: 10, missing: true, missingReason: 'replaced', replacement: { replacementBarcode: 'B' } }),
                line({ id: 'p2', barcode: 'B', status: 'admin_add', amount: 2, price: 12, finalAmount: 2, replacement: { originalBarcode: 'A' } })
            ]
        }
        const { DL, calls } = harness(order)
        await pick_complete({ id: 'o1' }, { DL, _admin: ADMIN, utils: {} })

        assert.equal(calls.orderUpdate.$set.cart[0].replacedBy, 'B')
    })
})
