import { Worker } from 'bullmq'
import { FETCH_QUEUE, getConnection } from '#server/queues/gs1Queues.js'
import { buildFingerprint, hashFingerprint } from '#server/services/gs1/images.js'
import { bufferRaw, bufferProgress, initBulkFlusher } from '#server/services/gs1/bulk.js'
import log from '#server/utils/log.js'

// Phase 1 (network-only): dump GS1 JSON into gs1_products. No gates, no zips,
// no product writes — enrich and images run later, purely from the collection.
export async function handleFetchJob(job, { DL, external }) {
    const { productCode, runId, force = false } = job.data
    if (!productCode) throw new Error('Missing productCode')

    const item = await external.gs1.getProduct(productCode)
    if (!item) {
        bufferProgress(runId, { processed: 1 })
        return { skipped: 'not-found' }
    }

    const { rawDoc, gtin, modificationTime, mediaAssets } = external.gs1.mapGs1ToProduct(item)
    const fingerprint = hashFingerprint(buildFingerprint(gtin, mediaAssets, modificationTime))

    // Freshness against our own dump: skip re-store when nothing changed.
    if (!force) {
        const stored = await DL.Gs1Product.readOne(
            { barcode: gtin },
            { _id: 0, modificationTime: 1, fingerprint: 1 }
        ).catch(() => null)
        if (stored?.modificationTime && modificationTime
            && new Date(modificationTime) <= new Date(stored.modificationTime)
            && stored.fingerprint === fingerprint) {
            bufferProgress(runId, { processed: 1 })
            return { skipped: 'up-to-date' }
        }
    }

    bufferRaw({ ...rawDoc, fingerprint, status: 'fetched' })
    bufferProgress(runId, { processed: 1 })
    return { fetched: true, gtin }
}

export default async function startGs1FetchWorker({ DL, external, sizing }) {
    initBulkFlusher(DL)
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
                // 429/5xx → BullMQ backoff retry; fatal errors count as failed.
                if (e?.rateLimited || e?.transient) throw e
                if (/GS1 (401|HTTP 4)/.test(e?.message || '')) throw e
                log.error(`[GS1Fetch] Failed ${job?.data?.productCode}:`, e?.message || e)
                bufferProgress(job?.data?.runId, { processed: 1, failed: 1 })
                return { failed: true }
            }
        },
        { connection: getConnection(), concurrency: sizing?.fetchConcurrency || 2 }
    )

    worker.on('error', err => log.warn('[GS1Fetch] Redis notice:', err?.message || err))
    worker.on('failed', (job, err) => log.error(`[GS1Fetch] Failed ${job?.data?.productCode}:`, err?.message || err))
    return worker
}
