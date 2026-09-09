import cron from 'node-cron'
import log from '#server/utils/log.js'
import { acquireLock } from '#server/utils/redisLock.js'
import { startRun } from '#server/services/gs1/sync.js'
import { runEnrich, runImages } from '#server/services/gs1/enrich.js'
import { getFetchQueue } from '#server/queues/gs1Queues.js'
import { initBulkFlusher } from '#server/services/gs1/bulk.js'

const LOCK_KEY = 'gs1-sync:lock'
const LOCK_TTL_SECONDS = 60 * 60 * 6

async function waitFetchDrain(timeoutMs) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
        const counts = await getFetchQueue()
            .getJobCounts('waiting', 'active', 'delayed').catch(() => ({}))
        const pending = (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0)
        if (!pending) return
        if (Date.now() > deadline) throw new Error(`fetch queue did not drain (${pending} left)`)
        await new Promise(r => setTimeout(r, 15000))
    }
}

// Nightly three-phase GS1 run: fetch dump → enrich texts → launch images.
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
            initBulkFlusher(DL)
            log.warn('[Gs1Sync] Phase 1: fetch dump started')
            const run = await startRun({}, { DL, external })
            await waitFetchDrain(Number(process.env.GS1_DRAIN_TIMEOUT_MS || 6 * 60 * 60 * 1000))
            log.warn('[Gs1Sync] Phase 2: enrich texts started')
            const texts = await runEnrich({ DL, external, runId: run.runId, onlyInStock: true })
            log.warn('[Gs1Sync] Phase 3: images launch started')
            const images = await runImages({ DL, external, runId: run.runId })
            log.success(`[Gs1Sync] Done: run=${run.runId} fetched=${run.total} `
                + `enriched=${texts.enriched} skipped=${texts.skipped} imagesQueued=${images.queued}`)
        } catch (e) {
            log.error('[Gs1Sync] Failed:', e?.message || e)
        } finally {
            await release?.().catch(() => { })
        }
    }, { timezone: process.env.TZ || 'Asia/Jerusalem' })

    log.info(`[Gs1Sync] Scheduled: ${schedule}`)
}
