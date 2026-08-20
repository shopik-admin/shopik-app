import { Worker } from 'bullmq'
import { createHash } from 'crypto'
import processImage from '#server/services/image/process.js'
import { getConnection, getQueue } from '#server/queues/imageQueue.js'
import log from '#server/utils/log.js'

const QUEUE_NAME = 'image-processing'
const hashUrl = url => createHash('sha1').update(url).digest('hex')

export default function startImageWorker({ DL }) {
    const worker = new Worker(
        QUEUE_NAME,
        async job => {
            const { productId, sourceUrl, force } = job.data
            if (!productId || !sourceUrl)
                throw new Error(`Invalid job data: ${JSON.stringify(job.data)}`)

            const product = await DL.Product.Model.findOne(
                { id: productId },
                { _id: 0, images: 1 }
            ).lean()

            if (!product)
                throw new Error(`Product not found: ${productId}`)

            const existing = product.images?.product || []
            const mainImage = existing.find(img => img?.main)
            if (!force && mainImage?.sourceUrl === sourceUrl && mainImage?.hash) {
                log.info(`[ImageWorker] Skip unchanged: ${productId}`)
                return
            }

            const sizes = await processImage({ productId, sourceUrl })

            const others = existing.filter(img => img && typeof img === 'object' && !img.main)
            await DL.Product.update(
                { id: productId },
                {
                    'images.product': [
                        { main: true, sourceUrl, hash: hashUrl(sourceUrl), sizes },
                        ...others
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