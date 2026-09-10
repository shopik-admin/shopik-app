import pLimit from 'p-limit'
import { enqueueProcessJobs } from '#server/queues/gs1Queues.js'
import { bufferProduct, bufferRaw, bufferProgress, flush } from './bulk.js'
import { stageZip, buildFingerprint, hashFingerprint, countStills, rankStills, bucketHasImage, buildImageSizes, isZipBuffer, zipEntryBasenames, baseName } from './images.js'
import { mem } from './memlog.js'
import log from '#server/utils/log.js'

const enrichBatchSize = () => Number(process.env.GS1_ENRICH_BATCH || 500)
const imageBatchSize = () => Number(process.env.GS1_IMAGE_BATCH || 200)
const zipConcurrency = () => Number(process.env.GS1_ZIP_CONCURRENCY || 2)
// GS1 files-endpoint image types (per supplier doc): EL = 360° spin set,
// PL = planogram, HE = hero, MK = market images. Our ranked S stills live
// in MK; EL is the multi-MB bloat (nested 40-frame container) we skip.
const mediaTypes = () => String(process.env.GS1_MEDIA_TYPES || 'mk')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

// Fetch the smallest usable source: try each configured type= filter first,
// stage the first whose zip actually contains our main still, else fall back
// to media=all (today's behavior, caps intact). Per-attempt byte counts are
// logged — that output is the EL/PL/HE/MK mapping proof per product.
// Returns { buffer, via } or null when nothing usable came back.
// rateLimited/transient errors throw (caller retries the batch); anything
// else on a type= attempt just moves to the next candidate.
async function fetchStagedSource(external, barcode, wantedMain) {
    if (wantedMain) {
        for (const t of mediaTypes()) {
            let buf = null
            try {
                buf = await external.gs1.getMediaZip(barcode, { type: t })
            } catch (e) {
                if (e?.rateLimited || e?.transient) throw e
                log.warn(`[GS1] type=${t} fetch failed for ${barcode}:`, e?.message || e)
                continue
            }
            if (!isZipBuffer(buf)) {
                log.info(`[GS1] type=${t} for ${barcode}: not a zip (${buf?.length || 0} bytes), skipping`)
                continue
            }
            const names = zipEntryBasenames(buf)
            if (names?.has(wantedMain)) {
                log.info(`[GS1] type=${t} for ${barcode}: ${buf.length} bytes, main present (${names.size} entries)`)
                return { buffer: buf, via: `type=${t}` }
            }
            log.info(`[GS1] type=${t} for ${barcode}: ${buf.length} bytes but main missing, skipping`)
        }
    }
    const buf = await external.gs1.getMediaZip(barcode)
    if (!buf?.length) return null
    return { buffer: buf, via: 'media=all' }
}

// Phase 2: enrich products from the local gs1_products collection.
// Two-pass to bound memory: page barcode-only docs, gate in bulk, then load
// full raws ONLY for passers. No GS1 calls, no per-doc writes, no images.
export async function enrichBatch({ DL, external, runId, onlyInStock = true, barcode = '' }) {
    const filter = barcode ? { status: 'fetched', barcode } : { status: 'fetched' }
    const page = await DL.Gs1Product.read(
        filter,
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
    mem(`enrich-batch done=${enriched + skipped} enriched=${enriched}`)
    return { done: false, enriched, skipped, total: page.length }
}

export async function runEnrich(opts) {
    const totals = { enriched: 0, skipped: 0, batches: 0, rescued: 0 }
    // Rescue pass first: products created (or restocked) after a skip stay
    // 'skipped' forever because enrich only pages status:'fetched'.
    try {
        totals.rescued = await requeueRescued(opts)
    } catch (e) {
        log.warn('[GS1] Rescue pass failed (continuing enrich):', e?.message || e)
    }
    for (;;) {
        const res = await enrichBatch(opts)
        totals.enriched += res.enriched
        totals.skipped += res.skipped
        totals.batches++
        if (res.done) break
        // Single-barcode mode: one batch is the whole job.
        if (opts?.barcode) break
    }
    await flush()
    log.success(`[GS1] Enrich done: ${totals.enriched} enriched, ${totals.skipped} skipped, ${totals.batches} batches, ${totals.rescued} rescued`)
    return totals
}

// Pre-pass for runEnrich: flip previously-skipped docs whose gate now passes
// back to 'fetched' (skipReason is cleared by the bulk flusher) so the normal
// flow picks them up. Covers catalog churn (product created after the skip)
// and restocks (out-of-stock skip, now in stock — or a false-run following a
// true-run). map-error/empty-raw are NOT rescuable by enrich alone.
const RESCUABLE_REASONS = ['no-product', 'no-comax', 'out-of-stock']
export async function requeueRescued({ DL, onlyInStock = true, barcode = '' }) {
    const match = barcode
        ? { status: 'skipped', skipReason: { $in: RESCUABLE_REASONS }, barcode }
        : { status: 'skipped', skipReason: { $in: RESCUABLE_REASONS } }
    const candidates = await DL.Gs1Product.read(
        match,
        { _id: 0, barcode: 1 },
        { limit: 0 }
    )
    const barcodes = [...new Set((candidates || []).map(r => r?.barcode).filter(Boolean))]
    if (!barcodes.length) return 0

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
    const comaxSet = new Set((comax || []).map(c => c.barcode))
    const inStockSet = new Set((products || []).filter(p => (p.storeIds || []).length).map(p => p.barcode))

    let rescued = 0
    for (const b of barcodes) {
        if (!productSet.has(b) || !comaxSet.has(b)) continue
        if (onlyInStock && !inStockSet.has(b)) continue
        bufferRaw({ barcode: b, status: 'fetched' })
        rescued++
    }
    if (rescued) {
        await flush()
        log.info(`[GS1] Rescued ${rescued} previously-skipped docs back to fetched`)
    }
    return rescued
}

// Phase 3 launcher: download zips (bounded concurrency), stage to GCS,
// enqueue CPU process jobs. Reads enriched raws; skips imageless/removed.
// force: reprocess even when imagesDone or the main fingerprint matches
// (needed to backfill alternates onto pre-alternates mains).
// limit: max raw docs to take this call (0 = all) — keeps single HTTP calls
// inside Cloud Run request timeouts; repeat until queued=0.
export async function runImages({ DL, external, runId, force = false, limit = 0, barcode = '' }) {
    const cap = Number(limit || process.env.GS1_IMAGE_LIMIT || 0)
    const limitZip = pLimit(zipConcurrency())
    const totals = { queued: 0, noZip: 0, skipped: 0, reused: 0 }
    let taken = 0
    for (;;) {
        if (cap && taken >= cap) break;
        const baseFilter = barcode
            ? { status: 'enriched', barcode }
            : { status: 'enriched' }
        const raws = await DL.Gs1Product.read(
            force ? { ...baseFilter, assetCount: { $gt: 0 } }
                : { ...baseFilter, assetCount: { $gt: 0 }, imagesDone: { $ne: true } },
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

        await Promise.all(raws.map(stored => limitZip(async () => {
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
            const mainMatches = main?.sourceUrl?.startsWith('gs1://') && main?.hash === fingerprint
            // Single-still products gain nothing from reprocessing: with a matching
            // main there are no alternates to backfill (also bounds force runs).
            if (mainMatches && (countStills(mapped.mediaAssets) < 2 || !force)) {
                bufferRaw({ barcode, imagesDone: true })
                return
            }
            // Bucket-first: expected keys already in GCS are reused — no GS1
            // download, no render. Keys/assetIds come from ranked metadata.
            const { main: rankedMain, alternates: rankedAlts } = rankStills(mapped.mediaAssets)
            const ranked = [
                ...(rankedMain ? [{ ...rankedMain, isMain: true }] : []),
                ...rankedAlts.map(r => ({ ...r, isMain: false }))
            ]
            const reuse = {}
            let allPresent = ranked.length > 0
            for (const r of ranked) {
                if (await bucketHasImage(product.id, r.key)) {
                    reuse[r.key] = { assetId: r.asset?.id || null, sizes: buildImageSizes(product.id, r.key) }
                } else {
                    allPresent = false
                }
            }
            if (allPresent) {
                const images = ranked.map(r => ({
                    main: r.isMain,
                    sourceUrl: r.isMain ? `gs1://${barcode}` : `gs1://${barcode}/${r.asset?.id || r.asset?.filename}`,
                    hash: fingerprint,
                    sizes: reuse[r.key].sizes
                }))
                const update = { 'images.product': images, gs1SyncedAt: new Date() }
                if ((product.images?.product || []).length === 0 && product.status === 'hidden')
                    update.status = 'active'
                bufferProduct(barcode, update)
                bufferRaw({ barcode, fingerprint, imagesDone: true })
                totals.reused++
                return
            }
            let zip = null
            let via = ''
            try {
                const res = await fetchStagedSource(external, barcode, baseName(ranked[0]?.asset?.filename || ''))
                zip = res?.buffer || null
                via = res?.via || ''
            } catch (e) {
                if (e?.rateLimited || e?.transient) throw e
                // Over-cap zips would otherwise re-download every run and stay
                // imageless (no imagesDone, no skip marker). Park them as
                // skipped — a force run reprocesses if the supplier shrinks it.
                if (/too large/.test(e?.message || '')) {
                    const bytes = (/(\d+) bytes/.exec(e.message || '') || [])[1] || '?'
                    bufferRaw({ barcode, imagesDone: true, skipReason: `zip-too-large:${bytes}` })
                    log.warn(`[GS1] Zip too large, parked ${barcode} (${bytes} bytes)`)
                    totals.skipped++
                    return
                }
                log.warn(`[GS1] Zip failed for ${barcode}:`, e?.message || e)
                totals.noZip++
                return
            }
            if (!zip) {
                totals.noZip++
                return
            }
            mem(`zip-downloaded gtin=${barcode} via=${via} bytes=${zip.length}`)
            const stagingPath = await stageZip(barcode, zip)
            bufferRaw({ barcode, fingerprint, stagingPath })
            await enqueueProcessJobs([{
                productId: product.id,
                gtin: barcode,
                stagingPath,
                fingerprint,
                productCode: mapped.productCode,
                runId,
                mediaAssets: mapped.mediaAssets,
                reuse
            }])
            totals.queued++
        })))

        bufferProgress(runId, { processed: raws.length })
        await flush()
        taken += raws.length
        mem(`images-batch taken=${taken} queued=${totals.queued} reused=${totals.reused} noZip=${totals.noZip}`)
    }
    await flush()
    log.success(`[GS1] Images launch done: ${totals.queued} queued, ${totals.reused} reused, ${totals.noZip} no-zip, ${totals.skipped} skipped`)
    return totals
}

export default { enrichBatch, runEnrich, runImages, requeueRescued }
