import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedPushHost, validateSubscription } from '../../server/utils/push/validateSubscription.js'

const keys = {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg'
}

const valid = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys
}

describe('push subscription validation', () => {
    it('accepts a known push service over https', () => {
        const result = validateSubscription(valid)
        assert.equal(result.endpoint, valid.endpoint)
        assert.deepEqual(result.keys, keys)
    })

    it('accepts Windows and Apple subdomains', () => {
        assert.equal(isAllowedPushHost('wns2-1234.notify.windows.com'), true)
        assert.equal(isAllowedPushHost('web.push.apple.com'), true)
    })

    it('rejects a non-https endpoint', () => {
        assert.throws(() => validateSubscription({ ...valid, endpoint: 'http://fcm.googleapis.com/fcm/send/abc' }))
    })

    it('rejects an internal or unknown host', () => {
        assert.throws(() => validateSubscription({ ...valid, endpoint: 'https://127.0.0.1/push' }))
        assert.throws(() => validateSubscription({ ...valid, endpoint: 'https://example.com/push' }))
    })

    it('rejects credentials and non-standard ports', () => {
        assert.throws(() => validateSubscription({ ...valid, endpoint: 'https://user:pass@fcm.googleapis.com/push' }))
        assert.throws(() => validateSubscription({ ...valid, endpoint: 'https://fcm.googleapis.com:8443/push' }))
    })

    it('rejects malformed keys', () => {
        assert.throws(() => validateSubscription({ ...valid, keys: { p256dh: 'short', auth: keys.auth } }))
        assert.throws(() => validateSubscription({ ...valid, keys: { p256dh: keys.p256dh, auth: '!!!' } }))
        assert.throws(() => validateSubscription({ endpoint: valid.endpoint }))
    })
})
