import path from 'path'
import sharp from 'sharp'
import storage from '#server/external/storage.js'
import uid from '#common/functions/uid.js'

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
// An icon is displayed at 17-40 CSS px, so one 128px variant covers 3x DPI.
export const ICON_SIZE = 128
export const ICON_MIN_PX = 64
export const ICON_MAX_PX = 1024
export const ICON_FORMATS = ['png', 'jpeg', 'webp']
export const ICON_DIR = 'images/categories'

const CACHE_CONTROL = 'public, max-age=31536000, immutable'

// Uploaded icons live in the bucket as `images/categories/<id>/<version>/icon.webp`;
// any other value is a legacy icon name from the Icon component.
export function isStoredIcon(value) {
    return typeof value === 'string' && value.startsWith(`${ICON_DIR}/`)
}

export function iconDir(categoryId) {
    return path.posix.join(ICON_DIR, String(categoryId).replace(/[^A-Za-z0-9._-]+/g, '-'))
}

/**
 * Raster-only upload (png/jpeg/webp): sharp decodes it and re-encodes one
 * square WebP. Vectors are rejected outright, so nothing that can carry
 * script or markup is ever stored or served.
 */
export async function toIconWebp(buffer) {
    let image
    try {
        image = sharp(buffer, { animated: false })
    } catch {
        throw { status: 400, message: 'unreadable image' }
    }

    let meta
    try {
        meta = await image.metadata()
    } catch {
        throw { status: 400, message: 'unreadable image' }
    }

    if (!ICON_FORMATS.includes(meta?.format))
        throw { status: 400, message: 'icon must be a PNG, JPEG or WebP image' }
    if (!meta.width || !meta.height)
        throw { status: 400, message: 'unreadable image' }

    const shortest = Math.min(meta.width, meta.height)
    if (shortest < ICON_MIN_PX)
        throw { status: 400, message: `icon must be at least ${ICON_MIN_PX}x${ICON_MIN_PX} pixels` }
    if (shortest > ICON_MAX_PX)
        throw { status: 400, message: `icon must be at most ${ICON_MAX_PX}x${ICON_MAX_PX} pixels` }

    try {
        return await image
            .resize({ width: ICON_SIZE, height: ICON_SIZE, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 90 })
            .toBuffer()
    } catch {
        throw { status: 400, message: 'could not convert the image' }
    }
}

// New version per upload (immutable cache); older versions are removed only
// after the new one is in place, so a failed upload never loses the current icon.
export async function saveIcon({ categoryId, data }) {
    const dir = iconDir(categoryId)
    const objectPath = `${dir}/${uid()}/icon.webp`

    await storage.uploadFile({
        path: objectPath,
        data,
        contentType: 'image/webp',
        cacheControl: CACHE_CONTROL
    })

    try {
        const [files] = await storage.getBucket().getFiles({ prefix: `${dir}/` })
        await Promise.all(
            files.filter(file => file.name !== objectPath).map(file => file.delete().catch(() => null))
        )
    } catch { }

    return objectPath
}

export async function deleteIcon(icon) {
    if (!isStoredIcon(icon)) return
    try {
        await storage.getBucket().file(icon).delete({ ignoreNotFound: true })
    } catch { }
}
