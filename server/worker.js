import boot from './boot.js'
import startImageWorker from '#server/workers/imageWorker.js'
import startGs1FetchWorker from '#server/workers/gs1FetchWorker.js'
import startGs1ProcessWorker from '#server/workers/gs1ProcessWorker.js'
import { resolveSizing } from '#server/services/gs1/sizing.js'
import log from '#server/utils/log.js'

console.log(`\n⚡ Starting image worker...\n`)

const bootData = await boot()
await startImageWorker({ DL: bootData.DL })
const sizing = resolveSizing()
await startGs1FetchWorker({ DL: bootData.DL, external: bootData.external, sizing })
await startGs1ProcessWorker({ DL: bootData.DL, sizing })

log.success('Image worker running')
