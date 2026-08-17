export default function getPlatform(req = {}) {
    const { headers } = req
    const explicit = (headers.platform || '').toLowerCase()
    if (explicit.startsWith('admin')) return explicit
    if (explicit.startsWith('web')) return explicit

    const ua = (headers['user-agent'] || '').toLowerCase()

    const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua)

    const isWebView =
        /\bwv\b/.test(ua) ||
        (ua.includes('android') &&
            ua.includes('version/') &&
            !ua.includes('chrome/')) ||

        (/(iphone|ipad|ipod)/.test(ua) &&
            ua.includes('applewebkit') &&
            !ua.includes('safari'))

    const host = (headers.host || '').toLowerCase()
    const referer = (headers.referer || '').toLowerCase()
    const prefix = req.originalUrl.includes('/admin') || host.includes('admin') || referer.includes('/admin') ? 'admin' : 'web'

    return isWebView
        ? `${prefix}_app`
        : isMobile
            ? `${prefix}_mobile`
            : prefix
}