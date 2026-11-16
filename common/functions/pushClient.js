/**
 * Client-side Web Push helpers.
 *
 * Pure functions only, so the tricky parts (base64 key decoding, when the bell
 * must show the red dot, Hebrew relative time) can be unit-tested without a
 * browser.
 */

export function isPushSupported(scope = typeof window !== 'undefined' ? window : undefined) {
    if (!scope) return false
    return Boolean(
        scope.Notification &&
        'serviceWorker' in scope.navigator &&
        'PushManager' in scope &&
        scope.isSecureContext !== false
    )
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
 * Relative time in Hebrew, short enough for a notification row.
 * `now` is injectable so the output is deterministic in tests.
 */
export function relativeTime(value, now = Date.now()) {
    if (!value) return ''
    const then = value instanceof Date ? value.getTime() : new Date(value).getTime()
    if (!Number.isFinite(then)) return ''

    const seconds = Math.max(0, Math.floor((now - then) / 1000))
    if (seconds < 60) return 'עכשיו'

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60)
        return minutes === 1 ? 'לפני דקה' : `לפני ${minutes} דקות`

    const hours = Math.floor(minutes / 60)
    if (hours < 24)
        return hours === 1 ? 'לפני שעה' : `לפני ${hours} שעות`

    const days = Math.floor(hours / 24)
    if (days === 1) return 'אתמול'
    if (days < 7) return `לפני ${days} ימים`

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
