// Resolve a setting file value (relative storage path, no host) to a full URL.
// Raster image settings store a base dir with {l,m,s}.webp variants;
// raw files (svg/ico/pdf) store the full object path. Absolute URLs
// (legacy) pass through untouched. Mirrors displayImageUrl/productImageUrl.
import { runtimeEnv } from './runtimeEnv.js'

const RAW_EXT = /\.(webp|png|jpe?g|svg|ico|pdf)$/i

export function getSettingFileUrl(value, size = 'l') {
    if (!value) return ''
    const str = String(value).trim()
    if (!str) return ''
    if (/^https?:\/\//i.test(str) || str.startsWith('data:')) return str
    const baked = typeof VITE_FILES_BASE_URL !== 'undefined' ? VITE_FILES_BASE_URL : ''
    const base = (runtimeEnv('FILES_BASE_URL', baked) || 'https://files.shopik.co.il').replace(/\/+$/, '')
    const clean = str.replace(/^\/+/, '').replace(/\/+$/, '')
    if (RAW_EXT.test(clean)) return `${base}/${clean}`
    return `${base}/${clean}/${size}.webp`
}
