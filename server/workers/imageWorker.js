import { Worker } from 'bullmq'
import { createHash } from 'crypto'
import processImage from '#server/services/image/process.js'
import { getConnection, getQueue } from '#server/queues/imageQueue.js'
import log from '#server/utils/log.js'

const QUEUE_NAME = 'image-processing'
const hashUrl = url => createHash('sha1').update(url).digest('hex')

export default async function startImageWorker({ DL }) {
    const connection = getConnection()

    try {
        await Promise.race([
            connection.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis unreachable (timeout)')), 2000))
        ])
    } catch (e) {
        log.warn('[ImageWorker] Redis unavailable, worker not started:', e?.message || e)
        return null
    }

    const worker = new Worker(
        QUEUE_NAME,
        async job => {
            const { productId, sourceUrl } = job.data
            if (!productId || !sourceUrl)
                throw new Error(`Invalid job data: ${JSON.stringify(job.data)}`)

            const start = performance.now()
            const sizes = await processImage({ productId, sourceUrl })
            console.log(`Resize took ${performance.now() - start}ms`)

            await DL.Product.update(
                { id: productId },
                {
                    'images.product': [
                        { main: true, sourceUrl, hash: hashUrl(sourceUrl), sizes }
                    ]
                }
            )

            log.success(`[ImageWorker] Done: ${productId}`)
        },
        {
            connection: getConnection(),
            concurrency: 4
        }
    )

    worker.on('error', err => {
        log.warn('[ImageWorker] Redis notice:', err?.message || err)
    })

    worker.on('failed', (job, err) => {
        log.error(`[ImageWorker] Failed ${job?.id} (${job?.data?.productId}):`, err?.message || err)
    })

    worker.on('completed', async job => {
        try {
            const counts = await getQueue().getJobCounts('waiting', 'active', 'delayed', 'failed')
            log.info(`[ImageWorker] Completed ${job?.data?.productId} — remaining: ${counts.waiting + counts.delayed} queued, ${counts.active} active, ${counts.failed} failed`)
        } catch (e) {
            log.warn('[ImageWorker] Queue count skipped:', e?.message || e)
        }
    })

    return worker
}