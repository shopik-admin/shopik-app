// Resolve a display-block image base path (relative object path, no host) to a
// full URL. Mirrors common/functions/productImageUrl.js.
export function getDisplayImageUrl(basePath, size = 'l') {
    if (!basePath) return ''
    const base = (VITE_FILES_BASE_URL || 'https://files.shopik.co.il').replace(/\/+$/, '')
    const clean = String(basePath).replace(/^\/+/, '').replace(/\/+$/, '')
    return `${base}/${clean}/${size}.webp`
}
