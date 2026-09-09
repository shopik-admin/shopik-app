import { Worker } from 'bullmq'
import { PROCESS_QUEUE, getConnection } from '#server/queues/gs1Queues.js'
import { processStagedZip, deleteStaged } from '#server/services/gs1/images.js'
import log from '#server/utils/log.js'

// CPU-bound: unzip + sharp + GCS upload for one product.
export async function handleProcessJob(job, { DL }) {
    const { productId, gtin, stagingPath, fingerprint, runId, mediaAssets = [] } = job.data
    if (!productId || !stagingPath) throw new Error('Missing productId/stagingPath')

    try {
        const product = await DL.Product.readOne(
            { id: productId },
            { _id: 0, id: 1, images: 1, status: 1 }
        )
        if (!product) return { skipped: 'no-product' }

        const { urls } = await processStagedZip({
            productId, gtin, path: stagingPath, mediaAssets
        })

        const update = {
            'images.product': [
                { main: true, sourceUrl: `gs1://${gtin}`, hash: fingerprint, sizes: urls }
            ],
            gs1SyncedAt: new Date()
        }
        // Mirror the Comax image-gating rule: first image flips imageless HIDDEN → ACTIVE.
        if ((product.images?.product || []).length === 0 && product.status === 'hidden')
            update.status = 'active'

        await DL.Product.update({ id: productId }, update)
        log.success(`[GS1Process] Done: ${productId} (${gtin})`)
        return { done: true }
    } finally {
        await deleteStaged(stagingPath)
        if (runId) {
            await DL.Gs1SyncState.updateOne(
                { key: runId },
                { $inc: { processed: 1 } },
                { upsert: true }
            ).catch(() => { })
        }
    }
}

export default async function startGs1ProcessWorker({ DL, sizing }) {
    const connection = getConnection()
    try {
        await Promise.race([
            connection.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis unreachable (timeout)')), 2000))
        ])
    } catch (e) {
        log.warn('[GS1Process] Redis unavailable, worker not started:', e?.message || e)
        return null
    }

    const worker = new Worker(
        PROCESS_QUEUE,
        async job => handleProcessJob(job, { DL }),
        { connection: getConnection(), concurrency: sizing?.cpuConcurrency || 2 }
    )

    worker.on('error', err => log.warn('[GS1Process] Redis notice:', err?.message || err))
    worker.on('failed', (job, err) => log.error(`[GS1Process] Failed ${job?.data?.gtin}:`, err?.message || err))
    return worker
}
