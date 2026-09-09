import { createHash } from 'crypto'
import { unzipSync } from 'fflate'
import storage from '#server/external/storage.js'
import resize from '#server/services/image/resize.js'
import upload from '#server/services/image/upload.js'
import log from '#server/utils/log.js'

export const hashFingerprint = fp => createHash('sha1').update(fp).digest('hex')

// Stable fingerprint for change detection: GTIN + asset ids + supplier modification time.
export function buildFingerprint(gtin, mediaAssets, modificationTime) {
    const ids = (mediaAssets || []).map(a => a?.id).filter(Boolean).sort().join(',')
    return `${gtin}|${ids}|${modificationTime?.toISOString?.() || modificationTime || ''}`
}

export function stagingPath(gtin) {
    return `gs1-staging/${gtin}-${Date.now()}.zip`
}

export async function stageZip(gtin, buffer) {
    const path = stagingPath(gtin)
    await storage.uploadFile({ path, data: buffer, contentType: 'application/zip' })
    return path
}

export async function downloadStaged(path) {
    const [buffer] = await storage.getBucket().file(path).download()
    return buffer
}

export async function deleteStaged(path) {
    try {
        await storage.getBucket().file(path).delete()
    } catch (e) {
        log.warn(`[GS1] Staging cleanup skipped for ${path}:`, e?.message || e)
    }
}

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i
const baseName = p => String(p || '').split('/').pop()

// Prefer the supplier default image, match zip entries by filename, fallback to largest image.
export function pickImageEntry(zipBuffer, mediaAssets) {
    let entries
    try {
        entries = unzipSync(new Uint8Array(zipBuffer))
    } catch (e) {
        throw new Error(`GS1 zip corrupt: ${e?.message || e}`)
    }
    const images = Object.entries(entries)
        .filter(([name]) => IMAGE_EXT.test(name))
        .map(([name, data]) => ({ name, data: Buffer.from(data) }))
    if (!images.length) throw new Error('GS1 zip contains no images')

    const ranked = (mediaAssets || []).filter(a => IMAGE_EXT.test(a?.filename || ''))
    const preferred = ranked.find(a => String(a.default_image) === '1')
        || ranked.find(a => String(a.publish_file) === '1')
        || ranked[0]
    if (preferred?.filename) {
        const hit = images.find(e => baseName(e.name) === baseName(preferred.filename))
        if (hit) return { ...hit, asset: preferred }
    }
    images.sort((a, b) => b.data.length - a.data.length)
    return { ...images[0], asset: preferred || null }
}

export async function processStagedZip({ productId, gtin, path, mediaAssets }) {
    const zipBuffer = await downloadStaged(path)
    const { name, data, asset } = pickImageEntry(zipBuffer, mediaAssets)
    log.info(`[GS1] Picked ${name} for GTIN ${gtin}`)
    const sizes = await resize(data)
    const urls = await upload({ productId, sizes })
    return { urls, assetFile: asset?.filename || baseName(name) }
}

export default {
    hashFingerprint, buildFingerprint, stagingPath, stageZip,
    downloadStaged, deleteStaged, pickImageEntry, processStagedZip
}
