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

// S-type stills only (same semantics as pickImageEntries): 360° frames and
// E containers never qualify, so products with <2 stills gain nothing from reprocessing.
export function countStills(mediaAssets) {
    return (mediaAssets || []).filter(a =>
        String(a?.image_type || 'S').toUpperCase() === 'S'
        && IMAGE_EXT.test(a?.filename || '')
    ).length
}

// Multi-pick: S-type stills only (360° EL spin sets deferred).
// Main = default_image match; alternates = other S matches, capped.
// Falls back to the legacy single largest pick when nothing matches.
export function pickImageEntries(zipBuffer, mediaAssets, maxAlternates) {
    const cap = maxAlternates ?? Number(process.env.GS1_MAX_ALTERNATES || 4)
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

    // S stills only: image_type 'S' with an image filename. E containers (zips)
    // and 360° frames never match an S filename, so they're excluded by construction.
    const stills = (mediaAssets || []).filter(a =>
        String(a?.image_type || 'S').toUpperCase() === 'S'
        && IMAGE_EXT.test(a?.filename || ''))
    const rank = a => String(a.default_image) === '1' ? 0
        : String(a.publish_file) === '1' ? 1 : 2
    const ordered = [...stills].sort((a, b) => rank(a) - rank(b))
    const matched = []
    for (const asset of ordered) {
        const hit = images.find(e => baseName(e.name) === baseName(asset.filename))
        if (hit && !matched.some(m => m.name === hit.name))
            matched.push({ ...hit, asset })
    }
    if (!matched.length) {
        images.sort((a, b) => b.data.length - a.data.length)
        return { main: { ...images[0], asset: stills[0] || null }, alternates: [] }
    }
    const [main, ...rest] = matched
    return { main, alternates: rest.slice(0, Math.max(0, cap)) }
}

// Legacy single pick (main only).
export function pickImageEntry(zipBuffer, mediaAssets) {
    const { main } = pickImageEntries(zipBuffer, mediaAssets, 0)
    return main
}

export async function processStagedZip({ productId, gtin, path, mediaAssets, fingerprint }) {
    const zipBuffer = await downloadStaged(path)
    const { main, alternates } = pickImageEntries(zipBuffer, mediaAssets)
    log.info(`[GS1] Picked ${main.name} + ${alternates.length} alternates for GTIN ${gtin}`)
    // Sequential per image to bound peak memory (512MB boxes).
    const processOne = async (entry, key, isMain) => {
        const sizes = await resize(entry.data)
        const urls = await upload({ productId, sizes, key })
        return {
            main: isMain,
            sourceUrl: isMain ? `gs1://${gtin}` : `gs1://${gtin}/${entry.asset?.id || baseName(entry.name)}`,
            hash: fingerprint,
            sizes: urls
        }
    }
    const images = [await processOne(main, '', true)]
    for (let i = 0; i < alternates.length; i++) {
        images.push(await processOne(alternates[i], `alt-${i + 1}`, false))
    }
    return { images, assetFile: main.asset?.filename || baseName(main.name) }
}

export default {
    hashFingerprint, buildFingerprint, stagingPath, stageZip,
    downloadStaged, deleteStaged, pickImageEntry, pickImageEntries, countStills, processStagedZip
}
