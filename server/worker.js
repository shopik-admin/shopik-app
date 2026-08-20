import boot from './boot.js'
import startImageWorker from '#server/workers/imageWorker.js'
import log from '#server/utils/log.js'

console.log(`\n⚡ Starting image worker...\n`)

const bootData = await boot()
await startImageWorker({ DL: bootData.DL })

log.success('Image worker running')