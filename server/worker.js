import boot from './boot.js'
import startImageWorker from '#server/workers/imageWorker.js'
import log from '#server/utils/log.js'

console.log(`\n⚙ Starting image worker...\n`)

const bootData = await boot()
const worker = await startImageWorker({ DL: bootData.DL })

if (!worker) {
    log.error('Image worker could not start (Redis unreachable)')
    process.exit(1)
}

log.success('Image worker running')

async function shutdown(signal) {
    log.warn(`${signal} received, shutting down worker...`)
    const forceExit = setTimeout(() => process.exit(1), 10000)
    forceExit.unref()
    try {
        await Promise.allSettled([
            worker.close(),
            bootData.DL.disconnect?.()
        ])
    } finally {
        process.exit(0)
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
