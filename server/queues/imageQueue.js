import { Queue } from 'bullmq'
import Redis from 'ioredis'

const QUEUE_NAME = 'image-processing'

let queue
let connection

export function getConnection() {
    if (!connection) {
        connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            connectTimeout: 2000,
            maxRetriesPerRequest: null,
            enableOfflineQueue: true,
            lazyConnect: true,
            retryStrategy(times) {
                if (times > 3) return null
                return 1000
            }
        })
    }
    return connection
}

export function getQueue() {
    if (!queue)
        queue = new Queue(QUEUE_NAME, { connection: getConnection() })
    return queue
}

export async function enqueueImageJobs(jobs) {
    if (!jobs?.length) return

    await getQueue().addBulk(
        jobs.map(job => ({
            name: 'process-image',
            data: {
                productId: job.productId,
                sourceUrl: job.sourceUrl
            },
            opts: {
                jobId: `p-${job.productId}`,
                attempts: 5,
                backoff: { type: 'exponential', delay: 2 * 60 * 1000 },
                removeOnComplete: true,
                removeOnFail: false
            }
        }))
    )
}