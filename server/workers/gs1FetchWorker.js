import { Worker } from 'bullmq'
import { FETCH_QUEUE, getConnection } from '#server/queues/gs1Queues.js'
import { enqueueProcessJobs } from '#server/queues/gs1Queues.js'
import { buildFingerprint, hashFingerprint, stageZip } from '#server/services/gs1/images.js'
import log from '#server/utils/log.js'

async function touchProgress(DL, runId, patch) {
    if (!runId) return
    try {
        await DL.Gs1SyncState.updateOne({ key: runId }, patch, { upsert: true })
    } catch (e) {
        log.warn('[GS1] Progress update skipped:', e?.message || e)
    }
}

// Network-bound: GS1 JSON + zip fetch, Comax/in-stock gates, metadata upsert.
export async function handleFetchJob(job, { DL, external }) {
    const { productCode, runId, onlyInStock = true, forceImages = false } = job.data
    if (!productCode) throw new Error('Missing productCode')

    const item = await external.gs1.getProduct(productCode)
    if (!item) {
        await touchProgress(DL, runId, { $inc: { processed: 1 } })
        return { skipped: 'not-found' }
    }

    const { doc, gtin, modificationTime, mediaAssets, removal } = external.gs1.mapGs1ToProduct(item)

    // Gate 1: Shopik product must exist (Comax is the basis for existence).
    const existing = await DL.Product.readOne(
        { barcode: gtin },
        { _id: 0, id: 1, barcode: 1, images: 1, status: 1, storeIds: 1, gs1SyncedAt: 1 }
    )
    if (!existing) {
        await touchProgress(DL, runId, { $inc: { processed: 1 } })
        return { skipped: 'no-product' }
    }
    const comax = await DL.ComaxProduct.readOne({ barcode: gtin }, { _id: 0, barcode: 1 })
    if (!comax) {
        await touchProgress(DL, runId, { $inc: { processed: 1 } })
        return { skipped: 'no-comax' }
    }
    // Gate 2 (bootstrap): in-stock products first.
    if (onlyInStock && !(existing.storeIds || []).length) {
        await touchProgress(DL, runId, { $inc: { processed: 1 } })
        return { skipped: 'out-of-stock' }
    }

    // Freshness: supplier modification time not newer than our sync.
    if (!forceImages && modificationTime && existing.gs1SyncedAt
        && modificationTime <= new Date(existing.gs1SyncedAt)) {
        await touchProgress(DL, runId, { $inc: { processed: 1 } })
        return { skipped: 'up-to-date' }
    }

    // Supplier removed/unchecked images → clear local images (Comax sync re-activates on return).
    if (removal.deleted || removal.unchecked) {
        await DL.Product.updateOne(
            { barcode: gtin },
            { $set: { ...doc, 'images.product': [] } }
        )
        await touchProgress(DL, runId, { $inc: { processed: 1 } })
        log.warn(`[GS1] Images cleared for ${gtin} (supplier ${removal.deleted ? 'deleted' : 'unchecked'})`)
        return { cleared: true }
    }

    await DL.Product.updateOne({ barcode: gtin }, { $set: doc })

    if (!mediaAssets.length) {
        await touchProgress(DL, runId, { $inc: { processed: 1 } })
        return { updated: true, images: 'none' }
    }

    const fingerprint = hashFingerprint(buildFingerprint(gtin, mediaAssets, modificationTime))
    const main = (existing.images?.product || []).find(i => i?.main)
    if (!forceImages && main?.sourceUrl?.startsWith('gs1://') && main?.hash === fingerprint) {
        await touchProgress(DL, runId, { $inc: { processed: 1 } })
        return { updated: true, images: 'unchanged' }
    }

    const zip = await external.gs1.getMediaZip(gtin)
    if (!zip) {
        await touchProgress(DL, runId, { $inc: { processed: 1 } })
        return { updated: true, images: 'no-zip' }
    }
    const stagingPath = await stageZip(gtin, zip)
    await enqueueProcessJobs([{
        productId: existing.id, gtin, stagingPath, fingerprint, productCode, runId, mediaAssets
    }])
    return { updated: true, images: 'queued' }
}

export default async function startGs1FetchWorker({ DL, external, sizing }) {
    const connection = getConnection()
    try {
        await Promise.race([
            connection.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis unreachable (timeout)')), 2000))
        ])
    } catch (e) {
        log.warn('[GS1Fetch] Redis unavailable, worker not started:', e?.message || e)
        return null
    }

    const worker = new Worker(
        FETCH_QUEUE,
        async job => {
            try {
                return await handleFetchJob(job, { DL, external })
            } catch (e) {
                // 429/5xx → BullMQ backoff retry; fatal errors return as skips inside handler.
                if (e?.rateLimited || e?.transient) throw e
                if (/GS1 (401|HTTP 4)/.test(e?.message || '')) throw e
                log.error(`[GS1Fetch] Failed ${job?.data?.productCode}:`, e?.message || e)
                await DL.Gs1SyncState.updateOne(
                    { key: job?.data?.runId || 'unknown' },
                    { $inc: { processed: 1, failed: 1 } },
                    { upsert: true }
                ).catch(() => { })
                return { failed: true }
            }
        },
        { connection: getConnection(), concurrency: sizing?.fetchConcurrency || 12 }
    )

    worker.on('error', err => log.warn('[GS1Fetch] Redis notice:', err?.message || err))
    worker.on('failed', (job, err) => log.error(`[GS1Fetch] Failed ${job?.data?.productCode}:`, err?.message || err))
    return worker
}
