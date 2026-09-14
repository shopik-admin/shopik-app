/**
 * Backfill user_stats from existing orders (one-off).
 * Usage: node server/scripts/runBackfillUserStats.js
 * Env: MONGODB_URI
 *
 * Same aggregation + mapping as the user/sync_stats route, with CLI logging.
 */
import { statsDocFromRow, userStatsAggregation } from '#server/utils/data/userStats.js'

export default async function backfillUserStats({ DL } = {}) {
    if (!DL) {
        console.log('[userStats] DL required — call backfillUserStats({ DL }) from boot/cron')
        return
    }

    console.log('[userStats] Aggregating orders...')
    const rows = await DL.Order.Model.aggregate(userStatsAggregation(), { allowDiskUse: true })
    const docs = (rows || []).map(statsDocFromRow)

    console.log(`[userStats] Upserting stats for ${docs.length} users...`)
    const res = await DL.UserStat.bulkWrite({
        docs,
        getFilter: doc => ({ userId: doc.userId }),
        getUpsert: () => true,
        getUpdate: doc => ({ $set: doc })
    }).catch(e => {
        console.log('[userStats] bulkWrite failed:', e?.message || e)
        return null
    })
    console.log(`[userStats] Done — upserted ${res?.upsertedCount ?? 0}, modified ${res?.modifiedCount ?? 0}`)
}
