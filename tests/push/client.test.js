import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pushNeedsAttention, relativeTime, urlBase64ToUint8Array, isPushSupported } from '../../common/functions/pushClient.js'

describe('push client helpers', () => {
    it('shows the red dot only when push is usable but not active', () => {
        const base = { supported: true, enabled: true, permission: 'granted', subscribed: true }
        assert.equal(pushNeedsAttention(base), false)
        assert.equal(pushNeedsAttention({ ...base, permission: 'default' }), true)
        assert.equal(pushNeedsAttention({ ...base, permission: 'denied' }), true)
        assert.equal(pushNeedsAttention({ ...base, subscribed: false }), true)
        assert.equal(pushNeedsAttention({ ...base, supported: false }), false)
        assert.equal(pushNeedsAttention({ ...base, enabled: false }), false)
    })

    it('decodes a base64url VAPID key', () => {
        const bytes = urlBase64ToUint8Array('AQID')
        assert.deepEqual([...bytes], [1, 2, 3])
    })

    it('formats relative time in Hebrew', () => {
        const now = new Date('2026-11-16T12:00:00Z').getTime()
        assert.equal(relativeTime(new Date(now - 10_000), now), 'עכשיו')
        assert.equal(relativeTime(new Date(now - 60_000), now), 'לפני דקה')
        assert.equal(relativeTime(new Date(now - 5 * 60_000), now), 'לפני 5 דקות')
        assert.equal(relativeTime(new Date(now - 60 * 60_000), now), 'לפני שעה')
        assert.equal(relativeTime(new Date(now - 3 * 60 * 60_000), now), 'לפני 3 שעות')
        assert.equal(relativeTime(new Date(now - 24 * 60 * 60_000), now), 'אתמול')
        assert.equal(relativeTime(new Date(now - 3 * 24 * 60 * 60_000), now), 'לפני 3 ימים')
        assert.match(relativeTime(new Date(now - 30 * 24 * 60 * 60_000), now), /^\d{2}\.\d{2}\.\d{4}$/)
        assert.equal(relativeTime(null, now), '')
    })

    it('detects unsupported environments', () => {
        assert.equal(isPushSupported(undefined), false)
        assert.equal(isPushSupported({ Notification: {}, navigator: {}, isSecureContext: true }), false)
    })
})
