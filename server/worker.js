import boot from './boot.js'
import startImageWorker from '#server/workers/imageWorker.js'
import startGs1FetchWorker from '#server/workers/gs1FetchWorker.js'
import startGs1ProcessWorker from '#server/workers/gs1ProcessWorker.js'
import startRefundRetry from '#server/cron/refundRetry.js'
import startNightlySync from '#server/cron/nightlySync.js'
import startGs1Sync from '#server/cron/gs1Sync.js'
import startHolidaySeed from '#server/cron/holidaySeed.js'
import startWindowSync from '#server/cron/windowSync.js'
import { resolveSizing } from '#server/services/gs1/sizing.js'
import log from '#server/utils/log.js'

console.log(`\n⚡ Starting image worker...\n`)

// Dedicated worker service entrypoint (`npm run worker`). Queue workers
// always run here; crons run only when RUN_CRON is explicitly enabled so a
// dev running web + worker locally doesn't double-schedule. Deploy target:
// web RUN_WORKERS=false RUN_CRON=false, worker RUN_CRON=true.
const RUN_CRON = process.env.RUN_CRON === 'true' || process.env.RUN_CRON === '1'
const { NO_NIGHT_SYNC } = process.env

const bootData = await boot()
await startImageWorker({ DL: bootData.DL })
const sizing = resolveSizing()
await startGs1FetchWorker({ DL: bootData.DL, external: bootData.external, sizing })
await startGs1ProcessWorker({ DL: bootData.DL, sizing })

if (RUN_CRON) {
    startRefundRetry(bootData)
    if (!NO_NIGHT_SYNC) {
        startNightlySync(bootData)
        startGs1Sync(bootData)
        startHolidaySeed(bootData)
        startWindowSync(bootData)
    }
    log.success('Worker running (queues + crons)')
} else {
    log.success('Worker running (queues only, RUN_CRON not set)')
}
