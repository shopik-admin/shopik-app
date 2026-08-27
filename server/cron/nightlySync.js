import cron from 'node-cron'
import log from '#server/utils/log.js'
import { acquireLock } from '#server/utils/redisLock.js'
import importComaxProducts from '#server/api/comax_product/import.js'
import syncComax from '#server/api/comax_product/sync.js'
import enqueueChangedImages from '#server/services/image/enqueue.js'

const LOCK_KEY = 'nightly-sync:lock'
const LOCK_TTL_SECONDS = 60 * 60 * 4

export default function startNightlySync(bootData) {
    const { DL, external } = bootData
    const schedule = process.env.NIGHTLY_SYNC_CRON || '0 2 * * *'

    cron.schedule(schedule, async () => {
        let release
        try {
            release = await acquireLock(DL.redis, LOCK_KEY, LOCK_TTL_SECONDS)
            if (!release) {
                log.warn('[NightlySync] Skipped — another instance holds the lock')
                return
            }

            log.warn('[NightlySync] Started')
            const importResult = await importComaxProducts({}, { DL, external })
            const syncResult = await syncComax({}, { DL })
            const enqueueResult = await enqueueChangedImages(DL)

            log.success(`[NightlySync] Done: import=${importResult.count}, sync=${syncResult.synced}, images=${enqueueResult.enqueued}`)
        } catch (e) {
            log.error('[NightlySync] Failed:', e?.message || e)
        } finally {
            await release?.().catch(() => {})
        }
    }, { timezone: process.env.TZ || 'Asia/Jerusalem' })

    log.info(`[NightlySync] Scheduled: ${schedule}`)
}