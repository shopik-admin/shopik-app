// Web Push subscription validation.
//
// The endpoint is attacker-controlled input that the server later POSTs to, so
// it must be pinned to a known push service and never point at an internal
// address. Keys are base64url-encoded ECDH material; reject anything that is not
// shaped like it instead of handing it to the encryption layer.

const EXACT_HOSTS = new Set([
    'fcm.googleapis.com',
    'android.googleapis.com',
    'updates.push.services.mozilla.com',
    'push.services.mozilla.com',
    'web.push.apple.com'
])

// Edge/Windows and newer Apple endpoints are region/tenant subdomains.
const HOST_SUFFIXES = [
    '.notify.windows.com',
    '.push.apple.com',
    '.push.services.mozilla.com'
]

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

export function isAllowedPushHost(hostname = '') {
    const host = String(hostname).toLowerCase()
    if (!host) return false
    if (EXACT_HOSTS.has(host)) return true
    return HOST_SUFFIXES.some(suffix => host.endsWith(suffix) && host.length > suffix.length)
}

export function isBase64Url(value, min = 16, max = 512) {
    if (typeof value !== 'string') return false
    if (value.length < min || value.length > max) return false
    return BASE64URL.test(value)
}

export function validateSubscription(payload = {}) {
    const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint.trim() : ''
    if (!endpoint || endpoint.length > 2048)
        throw { status: 400, message: 'invalid push endpoint' }

    let url
    try {
        url = new URL(endpoint)
    } catch {
        throw { status: 400, message: 'invalid push endpoint' }
    }

    if (url.protocol !== 'https:')
        throw { status: 400, message: 'push endpoint must be https' }
    if (url.username || url.password)
        throw { status: 400, message: 'invalid push endpoint' }
    if (url.port && url.port !== '443')
        throw { status: 400, message: 'invalid push endpoint' }
    if (!isAllowedPushHost(url.hostname))
        throw { status: 400, message: 'unsupported push service' }

    const keys = payload.keys || {}
    if (!isBase64Url(keys.p256dh, 40, 200))
        throw { status: 400, message: 'invalid push key' }
    if (!isBase64Url(keys.auth, 8, 100))
        throw { status: 400, message: 'invalid push auth key' }

    const expirationTime = Number(payload.expirationTime)
    return {
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        expirationTime: Number.isFinite(expirationTime) && expirationTime > 0 ? expirationTime : undefined
    }
}
