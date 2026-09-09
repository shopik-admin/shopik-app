import { runtimeEnv } from './runtimeEnv.js'

export function getProductImageUrl(id, size = 's') {
    if (!id) return ''
    const baked = typeof VITE_FILES_BASE_URL !== 'undefined' ? VITE_FILES_BASE_URL : ''
    const base = (runtimeEnv('FILES_BASE_URL', baked) || 'https://files.shopik.co.il').replace(/\/+$/, '')
    return `${base}/images/products/${id}/${size}.webp`
}
