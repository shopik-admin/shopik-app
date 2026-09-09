import { Queue } from 'bullmq'
import Redis from 'ioredis'

export const FETCH_QUEUE = 'gs1-fetch'
export const PROCESS_QUEUE = 'gs1-process'

let connection
let fetchQueue
let processQueue

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

// Rate limiter caps GS1 egress; raised empirically once 429/503 behavior is known.
// BullMQ limiter = max N jobs per `duration` window on the fetch queue.
export function getFetchQueue() {
    if (!fetchQueue) {
        fetchQueue = new Queue(FETCH_QUEUE, {
            connection: getConnection(),
            limiter: {
                max: Number(process.env.GS1_FETCH_MAX_PER_MIN || 60),
                duration: 60 * 1000
            }
        })
    }
    return fetchQueue
}

export function getProcessQueue() {
    if (!processQueue)
        processQueue = new Queue(PROCESS_QUEUE, { connection: getConnection() })
    return processQueue
}

const attempts = 5
const backoff = { type: 'exponential', delay: 2 * 60 * 1000 }

// jobId dedupes re-enqueues of the same product code across overlapping runs.
export async function enqueueFetchJobs(jobs) {
    if (!jobs?.length) return { enqueued: 0 }
    await getFetchQueue().addBulk(
        jobs.map(job => ({
            name: 'fetch-product',
            data: job,
            opts: {
                jobId: `gs1-${job.productCode}`,
                attempts,
                backoff,
                removeOnComplete: true,
                removeOnFail: false
            }
        }))
    )
    return { enqueued: jobs.length }
}

export async function enqueueProcessJobs(jobs) {
    if (!jobs?.length) return { enqueued: 0 }
    await getProcessQueue().addBulk(
        jobs.map(job => ({
            name: 'process-images',
            data: job,
            opts: {
                jobId: `gs1img-${job.productId}`,
                attempts,
                backoff,
                removeOnComplete: true,
                removeOnFail: false
            }
        }))
    )
    return { enqueued: jobs.length }
}

export default { getConnection, getFetchQueue, getProcessQueue, enqueueFetchJobs, enqueueProcessJobs }
