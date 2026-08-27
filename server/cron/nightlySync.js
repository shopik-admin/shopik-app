import cron from 'node-cron'
import log from '#server/utils/log.js'
import importComaxProducts from '#server/api/comax_product/import.js'
import syncComax from '#server/api/comax_product/sync.js'
import enqueueChangedImages from '#server/services/image/enqueue.js'
import importGovAddresses from '#server/scripts/importGovAddresses.js'

const LOCK_KEY = 'nightly-sync:lock'
const LOCK_TTL_SECONDS = 60 * 60 * 4

async function acquireLock(redis) {
    if (!redis) return null
    const token = `${process.pid}-${Date.now()}`
    const ok = await redis.set(LOCK_KEY, token, 'EX', LOCK_TTL_SECONDS, 'NX')
    if (!ok) return null
    return async () => {
        try {
            const current = await redis.get(LOCK_KEY)
            if (current === token) await redis.del(LOCK_KEY)
        } catch {
            // lock expires on its own via TTL
        }
    }
}

export default function startNightlySync(bootData) {
    const { DL, external } = bootData
    const schedule = process.env.NIGHTLY_SYNC_CRON || '0 2 * * *'
    const govSchedule = process.env.GOV_SYNC_CRON || '0 3 * * 0' // weekly Sunday 03:00

    cron.schedule(schedule, async () => {
        let release
        try {
            release = await acquireLock(DL.redis)
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

    cron.schedule(govSchedule, async () => {
        let release
        try {
            release = await acquireLock(DL.redis)
            if (!release) return
            log.warn('[GovSync] Started')
            await importGovAddresses({ DL })
            log.success('[GovSync] Done')
        } catch (e) {
            log.error('[GovSync] Failed:', e?.message || e)
        } finally {
            await release?.().catch(() => {})
        }
    }, { timezone: process.env.TZ || 'Asia/Jerusalem' })

    log.info(`[NightlySync] Scheduled: ${schedule}`)
    log.info(`[GovSync] Scheduled: ${govSchedule} (gov_address) — no boot fetch, weekly only`)
}