import path from 'path'
import storage from '#server/external/storage.js'
import resize from '#server/services/image/resize.js'
import uid from '#common/functions/uid.js'

const MAX_BYTES = 8 * 1024 * 1024
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

// Raster images go through sharp variants; vector/icon + pdf upload raw.
const RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const IMAGE_TYPES = [...RASTER_TYPES, 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
const FILE_TYPES = ['application/pdf']

// Bounding-box widths per variant (same convention as IMAGE_SIZES).
const SETTING_IMAGE_SIZES = { l: 600, m: 300, s: 120 }

function sanitizeName(name = 'file') {
    return String(name).split(/[?#]/)[0].split('/').pop().replace(/[^\w.\-]+/g, '-').slice(0, 80) || 'file'
}

// Upload a file for a file/image setting and point the setting value at the
// new relative path. Every upload gets a unique uid dir so the immutable
// cache-control never serves a stale logo after re-upload.
export default async function upload_file(payload, { DL, external }) {
    const { id, fileBase64, filename, contentType } = payload || {}
    if (!id) throw { status: 400, message: 'id required' }
    if (!fileBase64) throw { status: 400, message: 'fileBase64 required' }

    const setting = await DL.Setting.readById(id)
    if (!setting) throw { status: 400, message: 'setting does not exist' }
    const kind = setting.formType
    if (kind !== 'file' && kind !== 'image')
        throw { status: 400, message: 'setting is not a file/image setting' }

    let buffer
    try {
        buffer = Buffer.from(String(fileBase64).split(',').pop(), 'base64')
    } catch {
        throw { status: 400, message: 'invalid file' }
    }
    if (!buffer?.length || buffer.length > MAX_BYTES)
        throw { status: 400, message: 'file too large' }

    const type = String(contentType || '').toLowerCase().split(';')[0].trim()
    const ext = path.extname(String(filename || '').toLowerCase())

    const store = external?.storage || storage
    const version = uid()
    const baseDir = path.posix.join('images', 'settings', String(setting.domainId), String(setting.key), version)
    let basePath

    if (kind === 'image') {
        const isRaster = RASTER_TYPES.includes(type) || (!type && ['.png', '.jpg', '.jpeg', '.webp'].includes(ext))
        const isRawImage = ['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'].includes(type)
            || (!type && ['.svg', '.ico'].includes(ext))
        if (!isRaster && !isRawImage)
            throw { status: 400, message: 'invalid image type (png/jpg/webp/svg/ico only)' }
        if (isRaster) {
            let sizes
            try {
                sizes = await resize(buffer, SETTING_IMAGE_SIZES)
            } catch {
                throw { status: 400, message: 'invalid image' }
            }
            await Promise.all(
                Object.entries(sizes).map(([name, data]) =>
                    store.uploadFile({
                        path: path.posix.join(baseDir, `${name}.webp`),
                        data,
                        contentType: 'image/webp',
                        cacheControl: CACHE_CONTROL
                    })
                )
            )
            basePath = baseDir
        } else {
            const rawType = type || (ext === '.svg' ? 'image/svg+xml' : 'image/x-icon')
            const name = `${sanitizeName(path.basename(String(filename || 'image'), path.extname(String(filename || ''))) || 'image')}${ext || (rawType === 'image/svg+xml' ? '.svg' : '.ico')}`
            basePath = path.posix.join(baseDir, name)
            await store.uploadFile({ path: basePath, data: buffer, contentType: rawType, cacheControl: CACHE_CONTROL })
        }
    } else {
        if (type !== 'application/pdf' && ext !== '.pdf')
            throw { status: 400, message: 'invalid file type (pdf only)' }
        const name = `${sanitizeName(path.basename(String(filename || 'file.pdf'), '.pdf') || 'file')}.pdf`
        basePath = path.posix.join(baseDir, name)
        await store.uploadFile({ path: basePath, data: buffer, contentType: 'application/pdf', cacheControl: CACHE_CONTROL })
    }

    // Best-effort cleanup of the previous version so the bucket doesn't bloat.
    const prev = setting.value
    if (typeof prev === 'string' && prev.startsWith('images/settings/') && prev !== basePath) {
        try {
            const bucket = store.getBucket()
            const prefix = /\.(webp|png|jpe?g|svg|ico|pdf)$/i.test(prev)
                ? prev.slice(0, prev.lastIndexOf('/') + 1)
                : `${prev.replace(/\/+$/, '')}/`
            const [files] = await bucket.getFiles({ prefix })
            await Promise.all(files.map((f) => f.delete().catch(() => null)))
        } catch { }
    }

    const updated = await DL.Setting.updateOne({ id }, { value: basePath })
    return { basePath, setting: updated || { ...setting, value: basePath } }
}

upload_file.config = {
    required: ['id', 'fileBase64'],
    permissions: ['setting:update']
}
