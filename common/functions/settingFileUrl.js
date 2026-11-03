// Resolve a setting file value (relative storage path, no host) to a full URL.
// Raster image settings store a base dir with {l,m,s}.webp variants;
// raw files (svg/ico/pdf) store the full object path. Absolute URLs
// (legacy) pass through untouched. Mirrors displayImageUrl/productImageUrl.
import { runtimeEnv } from './runtimeEnv.js'
import { PWA_ICON_FILES } from './pwaIconUrl.js'

const RAW_EXT = /\.(webp|png|jpe?g|svg|ico|pdf)$/i

// Preview size for a setting's image variants: settings can declare their
// own `sizes` (e.g. seo.ogImage stores a single `full` variant), so callers
// must not assume the standard 'l' variant exists. appIcon uses the fixed
// OS-standard PNG variants, so it gets the 192 preview.
export function getSettingFileSize(setting, fallback = 'l') {
    if (setting?.key === 'appIcon') return PWA_ICON_FILES.icon192
    return Object.keys(setting?.sizes || {})[0] || fallback
}

export function getSettingFileUrl(value, size = 'l') {
    if (!value) return ''
    const str = String(value).trim()
    if (!str) return ''
    if (/^https?:\/\//i.test(str) || str.startsWith('data:')) return str
    const baked = typeof VITE_FILES_BASE_URL !== 'undefined' ? VITE_FILES_BASE_URL : ''
    const base = (runtimeEnv('FILES_BASE_URL', baked) || 'https://files.shopik.co.il').replace(/\/+$/, '')
    const clean = str.replace(/^\/+/, '').replace(/\/+$/, '')
    if (RAW_EXT.test(clean)) return `${base}/${clean}`
    // A size that is already a file name (declared in setting.sizes) is
    // used as-is; plain size names get the webp convention.
    return `${base}/${clean}/${size.includes('.') ? size : `${size}.webp`}`
}
