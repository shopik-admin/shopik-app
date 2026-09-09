import cron from 'node-cron'
import log from '#server/utils/log.js'
import { acquireLock } from '#server/utils/redisLock.js'
import { startRun } from '#server/services/gs1/sync.js'

const LOCK_KEY = 'gs1-sync:lock'
const LOCK_TTL_SECONDS = 60 * 60

// Nightly incremental GS1 enrichment (resumes from watermark).
// Runs after the Comax sync so the Comax-existence gate is fresh.
export default function startGs1Sync(bootData) {
    const { DL, external } = bootData
    if (process.env.GS1_SYNC_ENABLED === 'false') {
        log.info('[Gs1Sync] Disabled via GS1_SYNC_ENABLED=false')
        return
    }
    const schedule = process.env.GS1_SYNC_CRON || '0 4 * * *'

    cron.schedule(schedule, async () => {
        let release
        try {
            release = await acquireLock(DL.redis, LOCK_KEY, LOCK_TTL_SECONDS)
            if (!release) {
                log.warn('[Gs1Sync] Skipped — another instance holds the lock')
                return
            }
            log.warn('[Gs1Sync] Started')
            const result = await startRun({}, { DL, external })
            log.success(`[Gs1Sync] Done: run=${result.runId} total=${result.total} enqueued=${result.enqueued}`)
        } catch (e) {
            log.error('[Gs1Sync] Failed:', e?.message || e)
        } finally {
            await release?.().catch(() => { })
        }
    }, { timezone: process.env.TZ || 'Asia/Jerusalem' })

    log.info(`[Gs1Sync] Scheduled: ${schedule}`)
}
