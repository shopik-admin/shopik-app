import { runtimeEnv } from './runtimeEnv.js'

/**
 * Product image URLs are served with `Cache-Control: immutable`, so the URL is
 * the cache key: same URL forever means a replaced picture is never seen.
 * Every image entry carries a `hash` (sha1 of the source bytes/fingerprint),
 * and appending it as ?v= makes the URL change exactly when the picture does —
 * without costing a request when it does not.
 */
export function getProductImageUrl(id, size = 's', key = '', version = '') {
    if (!id) return ''
    const baked = typeof VITE_FILES_BASE_URL !== 'undefined' ? VITE_FILES_BASE_URL : ''
    const base = (runtimeEnv('FILES_BASE_URL', baked) || 'https://files.shopik.co.il').replace(/\/+$/, '')
    const cleanKey = String(key || '').replace(/^\/+|\/+$/g, '')
    const cleanVersion = String(version || '').replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 40)
    return `${base}/images/products/${id}/${cleanKey ? `${cleanKey}/` : ''}${size}.webp${cleanVersion ? `?v=${cleanVersion}` : ''}`
}

// The main entry's hash is the version an image card needs — the card only
// ever renders the main. Legacy entries without a hash keep the bare URL.
export function mainImageHash(product) {
    return (product?.images?.product || []).find(image => image?.main)?.hash || ''
}

// Main image lives at the flat path; alternates follow the GS1 writer
// convention (server/services/gs1/images.js): alt-1, alt-2, ... in entry order.
export function getProductImageUrls(id, images = [], size = 's') {
    let alternates = 0
    return (images || []).map(image => {
        if (image?.main) return getProductImageUrl(id, size, '', image?.hash)
        alternates += 1
        return getProductImageUrl(id, size, `alt-${alternates}`, image?.hash)
    })
}
