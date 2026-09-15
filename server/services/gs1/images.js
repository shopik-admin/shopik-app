import { createHash } from 'crypto'
import { unzipSync, zipSync } from 'fflate'
import storage from '#server/external/storage.js'
import resize from '#server/services/image/resize.js'
import upload from '#server/services/image/upload.js'
import { buildObjectPath, buildUrl } from '#server/services/image/paths.js'
import { IMAGE_SIZES } from '#server/services/image/constants.js'
import { mem } from './memlog.js'
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
export const baseName = p => String(p || '').split('/').pop()

// Invalid type= values return HTTP 200 with a short JSON error body, so a
// "successful" fetch is not necessarily a zip. Check before staging.
export function isZipBuffer(buffer) {
    return !!buffer?.length && buffer[0] === 0x50 && buffer[1] === 0x4b
}

// Basename set of a zip's entries, or null when unreadable.
// For validating small type-filtered candidates only — never media=all
// (inflating a 50MB spin-set zip in the launcher just to list it defeats
// the purpose of filtering).
export function zipEntryBasenames(buffer) {
    try {
        const entries = Object.keys(unzipSync(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)))
        return new Set(entries.map(baseName))
    } catch {
        return null
    }
}

// Magic-byte sniff for single-image type= responses: HE returns the raw
// hero bytes, not a zip (observed: byte-identical PNG still, not archived).
// Returns the file extension or null.
export function imageExtFromMagic(buffer) {
    if (!buffer || buffer.length < 12) return null
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg'
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png'
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
        && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'webp'
    return null
}

// Wrap a single raw image into the one-entry zip the worker pipeline expects
// (staging, pickImageEntries, resize all speak zip). The entry keeps the
// ranked main's filename — extension forced to the sniffed type so a
// mislabeled asset can't break the IMAGE_EXT gate — so basename matching
// just works; a non-matching hero still wins via the largest-file fallback.
// Alternates are absent by nature: single-image wins carry the main only.
export function wrapSingleImage(buffer, wantedMain) {
    const ext = imageExtFromMagic(buffer)
    if (!ext || !wantedMain) return null
    const stem = String(wantedMain).split('/').pop().replace(/\.[a-z0-9]+$/i, '') || 'hero'
    const name = `${stem}.${ext}`
    return {
        buffer: Buffer.from(zipSync({
            [name]: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        })),
        name
    }
}

// Ranked S-type stills with their storage keys ('' = main legacy path).
// Shared by the picker and the bucket-first check so both agree on keys.
export function rankStills(mediaAssets, maxAlternates = Number(process.env.GS1_MAX_ALTERNATES || 4)) {
    const stills = (mediaAssets || []).filter(a =>
        String(a?.image_type || 'S').toUpperCase() === 'S'
        && IMAGE_EXT.test(a?.filename || ''))
    const rank = a => String(a.default_image) === '1' ? 0
        : String(a.publish_file) === '1' ? 1 : 2
    const ordered = [...stills].sort((a, b) => rank(a) - rank(b))
    const main = ordered[0] || null
    const alternates = ordered.slice(1, 1 + Math.max(0, maxAlternates))
    return {
        main: main ? { asset: main, key: '' } : null,
        alternates: alternates.map((asset, i) => ({ asset, key: `alt-${i + 1}` }))
    }
}

// S-type stills only (same semantics as pickImageEntries): 360° frames and
// E containers never qualify, so products with <2 stills gain nothing from reprocessing.
export function countStills(mediaAssets) {
    const { main, alternates } = rankStills(mediaAssets, Number.MAX_SAFE_INTEGER)
    return (main ? 1 : 0) + alternates.length
}

// Multi-pick: S-type stills only (360° EL spin sets deferred).
// Main = default_image match; alternates = other S matches, capped.
// Falls back to the legacy single largest pick when nothing matches.
export function pickImageEntries(zipBuffer, mediaAssets, maxAlternates) {
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
    const { main: rankedMain, alternates: rankedAlts } = rankStills(mediaAssets, maxAlternates)
    const ordered = [...(rankedMain ? [rankedMain.asset] : []), ...rankedAlts.map(r => r.asset)]
    const matched = []
    for (const asset of ordered) {
        const hit = images.find(e => baseName(e.name) === baseName(asset.filename))
        if (hit && !matched.some(m => m.name === hit.name))
            matched.push({ ...hit, asset })
    }
    if (!matched.length) {
        images.sort((a, b) => b.data.length - a.data.length)
        return { main: { ...images[0], asset: ordered[0] || null }, alternates: [] }
    }
    const [main, ...rest] = matched
    return { main, alternates: rest }
}

// Smallest size as existence proxy: sizes are always written as one batch,
// so s.webp present ⇒ the key is complete.
export async function bucketHasImage(productId, key) {
    try {
        const [exists] = await storage.getBucket().file(buildObjectPath(productId, 's', key)).exists()
        return !!exists
    } catch {
        return false
    }
}

export function buildImageSizes(productId, key) {
    return Object.fromEntries(
        Object.keys(IMAGE_SIZES).map(size => [size, buildUrl(productId, size, key)])
    )
}

function altSourceUrl(gtin, entry) {
    return `gs1://${gtin}/${entry.asset?.id || baseName(entry.name)}`
}

export async function processStagedZip({ productId, gtin, path, mediaAssets, fingerprint, reuse = {} }) {
    const zipBuffer = await downloadStaged(path)
    mem(`zip-downloaded gtin=${gtin} bytes=${zipBuffer.length}`)
    const { main, alternates } = pickImageEntries(zipBuffer, mediaAssets)
    mem(`zip-inflated gtin=${gtin} main=${main.name} alts=${alternates.length}`)
    log.info(`[GS1] Picked ${main.name} + ${alternates.length} alternates for GTIN ${gtin}`)
    // Sequential per image to bound peak memory (512MB boxes).
    // Sizes within an image are also serial (one-at-a-time end to end).
    // Keys already in the bucket (verified by the launcher, asset-id matched)
    // are reused without re-render — no GS1/Sharp/GCS work for them.
    const processOne = async (entry, key, isMain) => {
        const cached = reuse[key]
        if (cached && cached.assetId === (entry.asset?.id || null) && cached.sizes) {
            entry.data = null
            log.info(`[GS1] Reused bucket image gtin=${gtin} key=${key || 'main'}`)
            return cached.sizes
        }
        try {
            const sizes = await resize(entry.data, undefined, { serial: true })
            return await upload({ productId, sizes, key, serial: true })
        } finally {
            entry.data = null // release the inflated buffer ASAP
        }
    }
    const mainUrls = await processOne(main, '', true)
    mem(`img-done gtin=${gtin} key=main`)
    const images = [{
        main: true,
        sourceUrl: `gs1://${gtin}`,
        hash: fingerprint,
        sizes: mainUrls
    }]
    for (let i = 0; i < alternates.length; i++) {
        const alt = alternates[i]
        const urls = await processOne(alt, `alt-${i + 1}`, false)
        mem(`img-done gtin=${gtin} key=alt-${i + 1}`)
        images.push({
            main: false,
            sourceUrl: altSourceUrl(gtin, alt),
            hash: fingerprint,
            sizes: urls
        })
    }
    return { images, assetFile: main.asset?.filename || baseName(main.name) }
}

export default {
    hashFingerprint, buildFingerprint, stagingPath, stageZip,
    downloadStaged, deleteStaged, pickImageEntries, isZipBuffer,
    zipEntryBasenames, baseName, imageExtFromMagic, wrapSingleImage,
    rankStills, countStills, bucketHasImage, buildImageSizes,
    processStagedZip
}
