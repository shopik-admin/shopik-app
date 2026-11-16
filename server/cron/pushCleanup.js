import cron from 'node-cron'
import log from '#server/utils/log.js'
import { PUSH_FAILURE_LIMIT } from '#server/external/push/index.js'

const DAY_MS = 24 * 60 * 60 * 1000
const STALE_SUBSCRIPTION_DAYS = 30
const NOTIFICATION_RETENTION_DAYS = 60

/**
 * Nightly hygiene:
 *  - drop endpoints that have been failing for a month (dead browser installs)
 *  - drop inbox rows older than the retention window
 *
 * Deleting a failed endpoint is what keeps the send path from paying for the
 * same dead subscription forever; a returning browser simply re-subscribes.
 */
export async function runPushCleanup({ DL, now = new Date() }) {
    const staleBefore = new Date(now.getTime() - STALE_SUBSCRIPTION_DAYS * DAY_MS)
    const retentionBefore = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS)

    const [subscriptions, notifications] = await Promise.all([
        DL.PushSubscription.Model.deleteMany({
            $or: [
                { disabledAt: { $ne: null, $lt: staleBefore } },
                { failureCount: { $gte: PUSH_FAILURE_LIMIT }, lastFailureAt: { $lt: staleBefore } }
            ]
        }),
        DL.AdminNotification.Model.deleteMany({ createdAt: { $lt: retentionBefore } })
    ])

    return {
        subscriptions: subscriptions?.deletedCount || 0,
        notifications: notifications?.deletedCount || 0
    }
}

export default function startPushCleanup(bootData) {
    // 03:10 — after the nightly sync jobs, before the working day starts.
    cron.schedule('10 3 * * *', () => {
        runPushCleanup(bootData).catch(e => log.warn('[Push] Cleanup failed:', e?.message || e))
    })
}
