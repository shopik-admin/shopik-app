// Service worker registration shared by the storefront and the admin app.
//
// Pure predicate so it can be unit-tested without a browser: HTTPS is
// required except on localhost/loopback during development. `*.localhost`
// counts as local: browsers resolve every such name to loopback and treat it
// as a trustworthy origin, and the admin app is developed on admin.localhost.
export function isServiceWorkerAllowed(location = {}, hasServiceWorker = true) {
    if (!hasServiceWorker) return false
    const { protocol = '', hostname = '' } = location || {}
    const isLocal =
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname === '::1'
    return protocol === 'https:' || isLocal
}

export function registerServiceWorker() {
    if (typeof window === 'undefined') return
    if (!isServiceWorkerAllowed(window.location, 'serviceWorker' in navigator)) return

    const register = () => {
        navigator.serviceWorker
            .register('/sw.js', { updateViaCache: 'none' })
            .catch(err => {
                console.debug('SW registration skipped/failed:', err?.message || err)
            })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
}
