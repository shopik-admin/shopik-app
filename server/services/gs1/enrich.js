import pLimit from 'p-limit'
import { enqueueProcessJobs } from '#server/queues/gs1Queues.js'
import { bufferProduct, bufferRaw, bufferProgress, flush } from './bulk.js'
import { stageZip, buildFingerprint, hashFingerprint } from './images.js'
import log from '#server/utils/log.js'

const enrichBatchSize = () => Number(process.env.GS1_ENRICH_BATCH || 500)
const imageBatchSize = () => Number(process.env.GS1_IMAGE_BATCH || 200)
const zipConcurrency = () => Number(process.env.GS1_ZIP_CONCURRENCY || 2)

// Phase 2: enrich products from the local gs1_products collection.
// Two-pass to bound memory: page barcode-only docs, gate in bulk, then load
// full raws ONLY for passers. No GS1 calls, no per-doc writes, no images.
export async function enrichBatch({ DL, external, runId, onlyInStock = true }) {
    const page = await DL.Gs1Product.read(
        { status: 'fetched' },
        { _id: 0, barcode: 1 },
        { limit: enrichBatchSize() }
    )
    if (!page?.length) return { done: true, enriched: 0, skipped: 0, total: 0 }

    const barcodes = [...new Set(page.map(r => r?.barcode).filter(Boolean))]
    const [products, comax] = await Promise.all([
        DL.Product.read(
            { barcode: { $in: barcodes } },
            { _id: 0, barcode: 1, storeIds: 1 },
            { limit: 0 }
        ),
        DL.ComaxProduct.read(
            { barcode: { $in: barcodes } },
            { _id: 0, barcode: 1 },
            { limit: 0 }
        )
    ])
    const productSet = new Set((products || []).map(p => p.barcode))
    const inStockSet = new Set((products || []).filter(p => (p.storeIds || []).length).map(p => p.barcode))
    const comaxSet = new Set((comax || []).map(c => c.barcode))

    let enriched = 0
    let skipped = 0
    const passing = []
    for (const barcode of barcodes) {
        const reason = !productSet.has(barcode) ? 'no-product'
            : !comaxSet.has(barcode) ? 'no-comax'
            : (onlyInStock && !inStockSet.has(barcode)) ? 'out-of-stock' : null
        if (reason) {
            bufferRaw({ barcode, status: 'skipped', skipReason: reason })
            skipped++
        } else {
            passing.push(barcode)
        }
    }

    if (passing.length) {
        const full = await DL.Gs1Product.read(
            { barcode: { $in: passing } },
            { _id: 0, barcode: 1, raw: 1 },
            { limit: 0 }
        )
        const fullByBarcode = new Map((full || []).map(r => [r?.barcode, r]))
        for (const barcode of passing) {
            const stored = fullByBarcode.get(barcode)
            if (!stored?.raw) {
                bufferRaw({ barcode, status: 'skipped', skipReason: 'empty-raw' })
                skipped++
                continue
            }
            let mapped
            try {
                mapped = external.gs1.mapGs1ToProduct(stored.raw)
            } catch (e) {
                bufferRaw({ barcode, status: 'skipped', skipReason: `map-error: ${e?.message || e}` })
                skipped++
                continue
            }
            // Supplier removed/unchecked images → clear local images (status untouched).
            if (mapped.removal.deleted || mapped.removal.unchecked) {
                bufferProduct(barcode, { ...mapped.doc, 'images.product': [] })
                log.warn(`[GS1] Images cleared for ${barcode} (supplier removal flag)`)
            } else {
                bufferProduct(barcode, mapped.doc)
            }
            bufferRaw({ barcode, status: 'enriched' })
            enriched++
        }
    }

    bufferProgress(runId, { processed: page.length })
    await flush()
    return { done: false, enriched, skipped, total: page.length }
}

export async function runEnrich(opts) {
    const totals = { enriched: 0, skipped: 0, batches: 0 }
    for (;;) {
        const res = await enrichBatch(opts)
        totals.enriched += res.enriched
        totals.skipped += res.skipped
        totals.batches++
        if (res.done) break
    }
    await flush()
    log.success(`[GS1] Enrich done: ${totals.enriched} enriched, ${totals.skipped} skipped, ${totals.batches} batches`)
    return totals
}

// Phase 3 launcher: download zips (bounded concurrency), stage to GCS,
// enqueue CPU process jobs. Reads enriched raws; skips imageless/removed.
// force: reprocess even when imagesDone or the main fingerprint matches
// (needed to backfill alternates onto pre-alternates mains).
export async function runImages({ DL, external, runId, force = false }) {
    const limit = pLimit(zipConcurrency())
    const totals = { queued: 0, noZip: 0, skipped: 0 }
    for (;;) {
        const raws = await DL.Gs1Product.read(
            force
                ? { status: 'enriched', assetCount: { $gt: 0 } }
                : { status: 'enriched', assetCount: { $gt: 0 }, imagesDone: { $ne: true } },
            { _id: 0, barcode: 1, raw: 1 },
            { limit: imageBatchSize() }
        )
        if (!raws?.length) break

        const barcodes = raws.map(r => r.barcode)
        const products = await DL.Product.read(
            { barcode: { $in: barcodes } },
            { _id: 0, id: 1, barcode: 1, images: 1 },
            { limit: 0 }
        )
        const productByBarcode = new Map((products || []).map(p => [p.barcode, p]))

        await Promise.all(raws.map(stored => limit(async () => {
            const barcode = stored.barcode
            const product = productByBarcode.get(barcode)
            if (!product) {
                bufferRaw({ barcode, status: 'skipped', skipReason: 'no-product-images' })
                totals.skipped++
                return
            }
            let mapped
            try {
                mapped = external.gs1.mapGs1ToProduct(stored.raw)
            } catch {
                bufferRaw({ barcode, status: 'skipped', skipReason: 'map-error-images' })
                totals.skipped++
                return
            }
            if (mapped.removal.deleted || mapped.removal.unchecked) {
                bufferRaw({ barcode, imagesDone: true })
                totals.skipped++
                return
            }
            const fingerprint = hashFingerprint(
                buildFingerprint(barcode, mapped.mediaAssets, mapped.modificationTime))
            const main = (product.images?.product || []).find(i => i?.main)
            if (!force && main?.sourceUrl?.startsWith('gs1://') && main?.hash === fingerprint) {
                bufferRaw({ barcode, imagesDone: true })
                return
            }
            let zip
            try {
                zip = await external.gs1.getMediaZip(barcode)
            } catch (e) {
                if (e?.rateLimited || e?.transient) throw e
                log.warn(`[GS1] Zip failed for ${barcode}:`, e?.message || e)
                totals.noZip++
                return
            }
            if (!zip) {
                totals.noZip++
                return
            }
            const stagingPath = await stageZip(barcode, zip)
            bufferRaw({ barcode, fingerprint, stagingPath })
            await enqueueProcessJobs([{
                productId: product.id,
                gtin: barcode,
                stagingPath,
                fingerprint,
                productCode: mapped.productCode,
                runId,
                mediaAssets: mapped.mediaAssets
            }])
            totals.queued++
        })))

        bufferProgress(runId, { processed: raws.length })
        await flush()
    }
    await flush()
    log.success(`[GS1] Images launch done: ${totals.queued} queued, ${totals.noZip} no-zip, ${totals.skipped} skipped`)
    return totals
}

export default { enrichBatch, runEnrich, runImages }
