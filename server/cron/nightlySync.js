import cron from 'node-cron'
import log from '#server/utils/log.js'
import { acquireLock } from '#server/utils/redisLock.js'
import importComaxProducts from '#server/api/comax_product/import.js'
import syncComax from '#server/api/comax_product/sync.js'
import syncStockForStores from '#server/api/cash_register/syncStock.js'
import enqueueChangedImages from '#server/services/image/enqueue.js'
import importGovAddresses from '#server/scripts/importGovAddresses.js'
import mem from '#server/utils/mem.js'

const LOCK_KEY = 'nightly-sync:lock'
const LOCK_TTL_SECONDS = 60 * 60 * 4

export default function startNightlySync(bootData) {

    const { DL, external } = bootData
    const schedule = process.env.NIGHTLY_SYNC_CRON || '0 2 * * *'
    const govSchedule = process.env.GOV_SYNC_CRON || '0 3 * * 0' // weekly Sunday 03:00

    cron.schedule(schedule, async () => {
        let release
        try {
            release = await acquireLock(DL.redis, LOCK_KEY, LOCK_TTL_SECONDS)
            if (!release) {
                log.warn('[NightlySync] Skipped — another instance holds the lock')
                return
            }

            log.warn('[NightlySync] Started')
            // The store feed carries the delivery price row (SalesPriceArray),
            // so a separate buying-price import is no longer needed.
            const importResult = await importComaxProducts({}, { DL, external })
            mem('after product import', 'NightlySync')
            // sync skips its internal image enqueue — nightly runs it once below.
            const syncResult = await syncComax({ skipImageEnqueue: true }, { DL })
            mem('after product sync', 'NightlySync')
            const enqueueResult = await enqueueChangedImages(DL)
            mem('after image enqueue', 'NightlySync')
            let stockResult = { syncedStores: 0 }
            try {
                stockResult = await syncStockForStores({}, { DL, external })
            } catch (e) {
                log.error('[NightlySync] stock sync failed:', e?.message || e)
            }

            log.success(`[NightlySync] Done: import=${importResult.count}, sync=${syncResult.synced}, images=${enqueueResult.enqueued}, stock=${JSON.stringify(stockResult)}`)
        } catch (e) {
            log.error('[NightlySync] Failed:', e?.message || e)
        } finally {
            await release?.().catch(() => { })
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
            await release?.().catch(() => { })
        }
    }, { timezone: process.env.TZ || 'Asia/Jerusalem' })

    log.info(`[NightlySync] Scheduled: ${schedule}`)
    log.info(`[GovSync] Scheduled: ${govSchedule} (gov_address) — no boot fetch, weekly only`)
}