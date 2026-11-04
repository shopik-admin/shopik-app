import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildSignQuery } from '../../server/external/hyp/index.js'

const base = {
    masof: '0086246125',
    key: 'api-key',
    passp: 'api-pass',
    amount: 300,
    orderNumber: 100019,
    orderId: 'o1',
    customer: {
        name: { first: 'Dana', last: 'Levi' },
        phone: '0501234567',
        email: 'dana@example.com'
    },
    tmp: 6
}

function query(overrides = {}) {
    return new URLSearchParams(buildSignQuery({ ...base, ...overrides }))
}

describe('buildSignQuery payments', () => {
    it('defaults to 6 payments when maxPayments is not provided', () => {
        assert.equal(query().get('Tash'), '6')
    })

    it('lets the customer pick 1..max payments when maxPayments > 1', () => {
        const params = query({ maxPayments: 6 })
        assert.equal(params.get('Tash'), '6')
    })

    it('keeps a single fixed payment when maxPayments is 1', () => {
        const params = query({ maxPayments: 1 })
        assert.equal(params.get('Tash'), '1')
    })

    it('clamps invalid values to 1..36 and falls back to 6', () => {
        assert.equal(query({ maxPayments: 0 }).get('Tash'), '1')
        assert.equal(query({ maxPayments: 999 }).get('Tash'), '36')
        assert.equal(query({ maxPayments: 'abc' }).get('Tash'), '6')
        assert.equal(query({ maxPayments: undefined }).get('Tash'), '6')
    })
})
