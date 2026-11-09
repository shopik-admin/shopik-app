// A category icon is either an Icon-component name (`basket`) or an uploaded
// icon stored as a relative bucket path (`images/categories/.../icon.webp`).
// Mirrors settingFileUrl: relative paths resolve against FILES_BASE_URL.
import { runtimeEnv } from './runtimeEnv.js'

const ICON_FILE_EXT = /\.(webp|png|jpe?g)$/i

export function isCategoryIconFile(icon) {
    if (!icon) return false
    const value = String(icon).trim()
    return /^https?:\/\//i.test(value) || value.startsWith('data:') || ICON_FILE_EXT.test(value)
}

export function categoryIconUrl(icon) {
    if (!isCategoryIconFile(icon)) return ''
    const value = String(icon).trim()
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value
    const baked = typeof VITE_FILES_BASE_URL !== 'undefined' ? VITE_FILES_BASE_URL : ''
    const base = (runtimeEnv('FILES_BASE_URL', baked) || 'https://files.shopik.co.il').replace(/\/+$/, '')
    return `${base}/${value.replace(/^\/+/, '')}`
}
