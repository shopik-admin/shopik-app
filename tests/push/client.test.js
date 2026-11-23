import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { configureTexts, getTextConfig } from '../../common/texts/TR.js'
import {
    PUSH_CONFIG_REASONS,
    isPushSupported,
    pushNeedsAttention,
    pushReason,
    pushSupport,
    relativeTime,
    urlBase64ToUint8Array
} from '../../common/functions/pushClient.js'

const BROWSER = { Notification: {}, navigator: { serviceWorker: {} }, PushManager: () => { }, isSecureContext: true }

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
        assert.equal(isPushSupported(BROWSER), true)
    })

    it('explains why push is unavailable', () => {
        assert.equal(pushSupport(undefined).reason, 'unsupported')
        assert.deepEqual(pushSupport({ ...BROWSER, isSecureContext: false }), { supported: false, reason: 'insecure-context' })
        assert.deepEqual(pushSupport({ ...BROWSER, Notification: undefined }), { supported: false, reason: 'unsupported' })
        assert.deepEqual(pushSupport(BROWSER), { supported: true, reason: 'ok' })
    })

    it('derives a single actionable reason', () => {
        const active = { supported: true, enabled: true, permission: 'granted', subscribed: true }
        assert.equal(pushReason(active), 'ok')
        assert.equal(pushReason({ ...active, supportReason: 'insecure-context', supported: false }), 'insecure-context')
        assert.equal(pushReason({ supported: false }), 'unsupported')
        assert.equal(pushReason({ ...active, enabled: false }), 'not-configured')
        assert.equal(pushReason({ ...active, permission: 'denied' }), 'denied')
        assert.equal(pushReason({ ...active, error: 'boom' }), 'subscribe-failed')
        assert.equal(pushReason({ ...active, permission: 'default' }), 'permission-required')
        assert.equal(pushReason({ ...active, subscribed: false }), 'not-subscribed')
    })

    it('treats only deployment problems as non-actionable', () => {
        assert.deepEqual(PUSH_CONFIG_REASONS, ['unsupported', 'insecure-context', 'not-configured'])
        assert.equal(PUSH_CONFIG_REASONS.includes('denied'), false)
        assert.equal(PUSH_CONFIG_REASONS.includes('not-subscribed'), false)
    })

    it('formats relative time in the active language', () => {
        const previous = getTextConfig()
        try {
            configureTexts({
                code: 'en',
                direction: 'ltr',
                texts: { push_time_now: 'now', push_time_minutes: '[count] minutes ago' },
                fallback: {}
            })
            const now = new Date('2026-11-16T12:00:00Z').getTime()
            assert.equal(relativeTime(new Date(now - 5_000), now), 'now')
            assert.equal(relativeTime(new Date(now - 5 * 60_000), now), '5 minutes ago')
            // A key the layer does not override keeps the Hebrew base.
            assert.equal(relativeTime(new Date(now - 24 * 60 * 60_000), now), 'אתמול')
        } finally {
            configureTexts(previous)
        }
    })
})
