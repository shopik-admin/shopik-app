/**
 * Backfill: re-derive all product image renditions with the bounded-box
 * resize (server/services/image/resize.js). Tall portrait sources previously
 * kept their full height (e.g. 500x1770 'm'); this caps every rung at its
 * size box (120/300/600/1000).
 *
 * Strategy: download the largest stored rung per image entry, re-resize, and
 * overwrite the same object paths in place. URLs, hashes and sourceUrls are
 * unchanged, so NO db writes are needed. Works uniformly for Comax and GS1
 * images (GS1 originals aren't stored, and the GS1 launcher reuses
 * bucket-present keys — re-rendering from stored xl avoids both problems at
 * negligible quality cost: one extra webp generation on downscale-only).
 *
 * After the run: purge the Cloud CDN edge
 *   gcloud compute url-maps invalidate-cdn-cache <URL_MAP> \
 *     --project <PROJECT> --path "/images/products/*" --async
 * (Browsers holding the old immutable files refresh on their own expiry.)
 *
 * Usage: node server/scripts/runReprocessProductImages.js [--dry-run]
 *          [--limit N] [--productId ID] [--concurrency N]
 */
import sharp from 'sharp'
import storage from '#server/external/storage.js'
import resize from '#server/services/image/resize.js'

const RUNGS = ['xl', 'l', 'm', 's']

function objectPathFromUrl(url) {
    try {
        return new URL(url).pathname.replace(/^\/+/, '')
    } catch {
        return ''
    }
}

async function downloadFirstAvailable(sizes) {
    for (const rung of RUNGS) {
        const url = sizes?.[rung]
        const path = url && objectPathFromUrl(url)
        if (!path) continue
        try {
            const [buffer] = await storage.getBucket().file(path).download()
            if (buffer?.length) return { buffer, fromRung: rung }
        } catch {
            // Missing rung — try the next smaller one.
        }
    }
    return {}
}

async function reprocessEntry(productId, entry, { dryRun } = {}) {
    const sizes = entry?.sizes
    if (!sizes) return { skipped: 'no-sizes' }
    const { buffer, fromRung } = await downloadFirstAvailable(sizes)
    if (!buffer) return { skipped: 'no-rungs' }

    const before = await sharp(buffer).metadata().catch(() => ({}))
    const next = await resize(buffer, undefined, { serial: true })

    const uploads = []
    for (const rung of RUNGS) {
        const path = sizes[rung] && objectPathFromUrl(sizes[rung])
        if (!path || !next[rung]) continue
        if (dryRun) {
            uploads.push({ rung, path, bytes: next[rung].length, dry: true })
            continue
        }
        await storage.uploadFile({
            path,
            data: next[rung],
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable'
        })
        uploads.push({ rung, path, bytes: next[rung].length })
    }
    return {
        ok: true,
        fromRung,
        before: before.width && before.height ? `${before.width}x${before.height}` : '?',
        uploads
    }
}

export default async function reprocessProductImages(
    { DL } = {},
    { dryRun = false, limit = 0, productId = '', concurrency = 3 } = {}
) {
    if (!DL) throw new Error('DL required')
    const cap = Number(limit) || 0
    const workers = Math.max(1, Number(concurrency) || 3)

    const filter = productId ? { id: productId } : {}
    const select = { _id: 0, id: 1, 'images.product': 1 }
    // images.product entries are tiny; one unbounded read keeps it simple.
    // (GS1 enrich.js uses the same { limit: 0 } pattern for this shape.)
    const products = await DL.Product.read(filter, select, { limit: 0 })
    const queue = (products || []).filter(p => p?.images?.product?.length)
    const totals = { products: queue.length, entries: 0, ok: 0, skipped: {}, bytesBefore: 0 }

    console.log(`[reprocess] ${queue.length} products with images${dryRun ? ' (DRY RUN)' : ''}`)
    let done = 0
    const nextJob = () => queue.splice(0, 1)[0]
    async function worker() {
        for (;;) {
            const product = nextJob()
            if (!product) return
            if (cap && done >= cap) return
            for (const entry of product.images.product) {
                totals.entries++
                try {
                    const res = await reprocessEntry(product.id, entry, { dryRun })
                    if (res.ok) {
                        totals.ok++
                        if (cap && done < 3)
                            console.log(`[reprocess] ${product.id} from=${res.fromRung} was=${res.before} rungs=${res.uploads.map(u => `${u.rung}:${u.bytes}`).join(',')}`)
                    } else {
                        totals.skipped[res.skipped] = (totals.skipped[res.skipped] || 0) + 1
                    }
                } catch (e) {
                    totals.skipped[`error:${e?.message || e}`.slice(0, 80)] =
                        (totals.skipped[`error:${e?.message || e}`.slice(0, 80)] || 0) + 1
                }
            }
            done++
            if (done % 100 === 0) console.log(`[reprocess] ${done}/${totals.products} products...`)
        }
    }
    await Promise.all(Array.from({ length: Math.min(workers, queue.length || 1) }, worker))

    console.log(`[reprocess] done: ${done} products, ${totals.ok}/${totals.entries} entries reprocessed, skipped=${JSON.stringify(totals.skipped)}`)
    return totals
}
