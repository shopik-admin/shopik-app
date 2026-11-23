/**
 * Client-side Web Push helpers.
 *
 * Pure functions only, so the tricky parts (base64 key decoding, when the bell
 * must show the red dot, relative time) can be unit-tested without a browser.
 */

import TR from '../texts/TR.js'

/**
 * Support with a reason, so the UI can explain silence instead of showing
 * nothing: an insecure origin (plain HTTP test server) and an unsupported
 * browser look identical from the outside.
 */
export function pushSupport(scope = typeof window !== 'undefined' ? window : undefined) {
    if (!scope) return { supported: false, reason: 'unsupported' }
    if (scope.isSecureContext === false) return { supported: false, reason: 'insecure-context' }
    if (!scope.Notification) return { supported: false, reason: 'unsupported' }
    if (!scope.navigator || !('serviceWorker' in scope.navigator)) return { supported: false, reason: 'unsupported' }
    if (!('PushManager' in scope)) return { supported: false, reason: 'unsupported' }
    return { supported: true, reason: 'ok' }
}

export function isPushSupported(scope = typeof window !== 'undefined' ? window : undefined) {
    return pushSupport(scope).supported
}

export function urlBase64ToUint8Array(base64String = '') {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    const output = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++)
        output[i] = raw.charCodeAt(i)
    return output
}

/** The bell's red dot: the admin is not actually reachable by push. */
export function pushNeedsAttention({ supported, enabled, permission, subscribed } = {}) {
    if (!supported || !enabled) return false
    return permission !== 'granted' || !subscribed
}

/**
 * Why push is not active, in a form the UI can explain.
 * `ok` means the browser is reachable; anything else is actionable or a
 * deployment problem worth surfacing.
 */
export function pushReason({ supported, supportReason, enabled, permission, subscribed, error } = {}) {
    if (!supported) return supportReason || 'unsupported'
    if (!enabled) return 'not-configured'
    if (permission === 'denied') return 'denied'
    if (error) return 'subscribe-failed'
    if (permission !== 'granted') return 'permission-required'
    if (!subscribed) return 'not-subscribed'
    return 'ok'
}

/** Reasons the admin cannot fix from the bell — shown to superadmins only. */
export const PUSH_CONFIG_REASONS = ['unsupported', 'insecure-context', 'not-configured']

/**
 * Relative time in the active language, short enough for a notification row.
 * `now` is injectable so the output is deterministic in tests.
 */
export function relativeTime(value, now = Date.now()) {
    if (!value) return ''
    const then = value instanceof Date ? value.getTime() : new Date(value).getTime()
    if (!Number.isFinite(then)) return ''

    const seconds = Math.max(0, Math.floor((now - then) / 1000))
    if (seconds < 60) return TR('push_time_now')

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60)
        return minutes === 1 ? TR('push_time_minute') : TR('push_time_minutes', { count: minutes })

    const hours = Math.floor(minutes / 60)
    if (hours < 24)
        return hours === 1 ? TR('push_time_hour') : TR('push_time_hours', { count: hours })

    const days = Math.floor(hours / 24)
    if (days === 1) return TR('push_time_yesterday')
    if (days < 7) return TR('push_time_days', { count: days })

    // Dates are formatted, not phrased: dd.mm.yyyy stays numeric in every language.
    const date = new Date(then)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${day}.${month}.${date.getFullYear()}`
}

/** Level → icon name used by the inbox row. */
export const NOTIFICATION_LEVEL_ICONS = {
    success: 'check',
    warning: 'warning',
    error: 'error',
    info: 'info'
}
