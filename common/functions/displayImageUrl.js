// Resolve a display-block image base path (relative object path, no host) to a
// full URL. Mirrors common/functions/productImageUrl.js.
import { runtimeEnv } from './runtimeEnv.js'

export function getDisplayImageUrl(basePath, size = 'l') {
    if (!basePath) return ''
    const baked = typeof VITE_FILES_BASE_URL !== 'undefined' ? VITE_FILES_BASE_URL : ''
    const base = (runtimeEnv('FILES_BASE_URL', baked) || 'https://files.shopik.co.il').replace(/\/+$/, '')
    const clean = String(basePath).replace(/^\/+/, '').replace(/\/+$/, '')
    return `${base}/${clean}/${size}.webp`
}
