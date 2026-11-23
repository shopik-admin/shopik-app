import cron from 'node-cron'
import log from '#server/utils/log.js'
import { PUSH_FAILURE_LIMIT } from '#server/external/push/index.js'

const DAY_MS = 24 * 60 * 60 * 1000
const STALE_SUBSCRIPTION_DAYS = 30
// The inbox is a "what happened just now" feed, not an archive: the order
// itself keeps the full history, so three days is enough for a shift handover.
const NOTIFICATION_RETENTION_DAYS = 3

/**
 * Scheduled hygiene, every six hours:
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
    // Every six hours: with a three-day retention this keeps the real maximum
    // age close to three days instead of three days plus a nightly gap.
    cron.schedule('10 */6 * * *', () => {
        runPushCleanup(bootData).catch(e => log.warn('[Push] Cleanup failed:', e?.message || e))
    })
}
