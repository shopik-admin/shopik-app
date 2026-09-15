import log from '#server/utils/log.js'

// Buffers GS1 writes and flushes them as bulkWrite batches instead of
// thousands of individual updateOne calls. Crash window is small (a few
// seconds of buffered work); the watermark overlap re-fetches anything lost.
let DLref = null
let timer = null
let flushing = false

const productWrites = new Map() // barcode -> fields (later wins)
const rawWrites = new Map() // barcode -> rawDoc
const progressWrites = new Map() // runId -> { processed, failed }

const batchSize = () => Number(process.env.GS1_BULK_SIZE || 100)
const intervalMs = () => Number(process.env.GS1_BULK_MS || 5000)

export function initBulkFlusher(DL) {
    DLref = DL
    if (!timer) {
        timer = setInterval(() => flush().catch(e =>
            log.warn('[GS1] Background flush failed:', e?.message || e)), intervalMs())
        timer.unref?.()
    }
}

export function bufferProduct(barcode, fields) {
    if (!barcode) return
    productWrites.set(barcode, { ...(productWrites.get(barcode) || {}), ...fields })
    if (productWrites.size >= batchSize()) void flush()
}

export function bufferRaw(rawDoc) {
    if (!rawDoc?.barcode) return
    rawWrites.set(rawDoc.barcode, rawDoc)
    if (rawWrites.size >= batchSize()) void flush()
}

export function bufferProgress(runId, { processed = 0, failed = 0 } = {}) {
    if (!runId) return
    const cur = progressWrites.get(runId) || { processed: 0, failed: 0 }
    cur.processed += processed
    cur.failed += failed
    progressWrites.set(runId, cur)
}

export async function flush() {
    if (!DLref || flushing) return
    if (!productWrites.size && !rawWrites.size && !progressWrites.size) return
    flushing = true
    // Snapshot-and-clear so concurrent jobs keep buffering safely. On failure
    // the snapshot is restored (newer entries win) and the error rethrown —
    // dropping cleared-but-unwritten docs here would leave them `fetched` and
    // recount them next batch, silently inflating enrich totals.
    const products = [...productWrites.entries()].map(([barcode, fields]) => ({ barcode, ...fields }))
    const raws = [...rawWrites.values()]
    const progress = [...progressWrites.entries()].map(([key, counts]) => ({ key, ...counts }))
    productWrites.clear()
    rawWrites.clear()
    progressWrites.clear()
    const restore = () => {
        for (const [barcode, fields] of products)
            productWrites.set(barcode, { ...fields, ...(productWrites.get(barcode) || {}) })
        for (const doc of raws)
            if (!rawWrites.has(doc.barcode)) rawWrites.set(doc.barcode, doc)
        for (const { key, ...counts } of progress) {
            const cur = progressWrites.get(key) || { processed: 0, failed: 0 }
            cur.processed += counts.processed || 0
            cur.failed += counts.failed || 0
            progressWrites.set(key, cur)
        }
    }

    try {
        if (products.length) {
            await DLref.Product.bulkWrite({
                docs: products,
                getFilter: d => ({ barcode: d.barcode })
            })
        }
        if (raws.length) {
            await DLref.Gs1Product.bulkWrite({
                docs: raws,
                getFilter: d => ({ barcode: d.barcode }),
                getUpsert: () => true,
                // $set-only updates leave a stale skipReason behind (e.g. an
                // 'out-of-stock' doc later enriched by an onlyInStock:false run
                // keeps showing the old reason). Clear it on transitions that
                // don't set a fresh one.
                getUpdate: d => (d.status === 'enriched' || d.status === 'fetched') && !('skipReason' in d)
                    ? { $set: d, $unset: { skipReason: '' } }
                    : { $set: d }
            })
        }
        if (progress.length) {
            await DLref.Gs1SyncState.bulkWrite({
                docs: progress,
                getFilter: d => ({ key: d.key }),
                getUpdate: d => ({ $inc: { processed: d.processed || 0, failed: d.failed || 0 } }),
                getUpsert: () => true
            })
        }
        if (products.length || raws.length)
            log.info(`[GS1] Flushed bulk: ${products.length} products, ${raws.length} raws`)
    } catch (e) {
        restore()
        throw e
    } finally {
        flushing = false
    }
}

export default { initBulkFlusher, bufferProduct, bufferRaw, bufferProgress, flush }
