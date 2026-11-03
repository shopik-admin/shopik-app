import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isServiceWorkerAllowed } from '../../common/functions/registerSW.js'

describe('isServiceWorkerAllowed', () => {
    it('rejects when the browser has no service worker support', () => {
        assert.equal(isServiceWorkerAllowed({ protocol: 'https:', hostname: 'shopik.co.il' }, false), false)
    })

    it('allows HTTPS', () => {
        assert.equal(isServiceWorkerAllowed({ protocol: 'https:', hostname: 'shopik.co.il' }), true)
    })

    it('rejects plain HTTP on a real domain', () => {
        assert.equal(isServiceWorkerAllowed({ protocol: 'http:', hostname: 'shopik.co.il' }), false)
    })

    it('allows localhost and loopback over HTTP', () => {
        assert.equal(isServiceWorkerAllowed({ protocol: 'http:', hostname: 'localhost' }), true)
        assert.equal(isServiceWorkerAllowed({ protocol: 'http:', hostname: '127.0.0.1' }), true)
        assert.equal(isServiceWorkerAllowed({ protocol: 'http:', hostname: '[::1]' }), true)
    })
})
