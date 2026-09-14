/**
 * Backfill user_stats from existing orders (one-off).
 * Usage: node server/scripts/runBackfillUserStats.js
 * Env: MONGODB_URI
 *
 * Aggregates paid orders (any status past cart, excluding failed carts)
 * grouped by userId: count, sum of final captured amounts, refunded totals,
 * first/last order dates. Upserts into user_stats keyed by userId.
 */
import { round2 } from '#common/functions/calcOrder/utils.js'

const COUNTED_STATUSES = ['paid', 'picking', 'picked', 'packed', 'shipped', 'done', 'canceled']

export default async function backfillUserStats({ DL } = {}) {
    if (!DL) {
        console.log('[userStats] DL required — call backfillUserStats({ DL }) from boot/cron')
        return
    }

    console.log('[userStats] Aggregating orders...')
    const rows = await DL.Order.Model.aggregate([
        { $match: { userId: { $exists: true, $ne: null }, status: { $in: COUNTED_STATUSES } } },
        {
            $group: {
                _id: '$userId',
                domainId: { $first: '$domainId' },
                ordersCount: { $sum: 1 },
                totalPaid: { $sum: { $ifNull: ['$finalSumWithShipping', { $ifNull: ['$finalSum', 0] }] } },
                refundedTotal: { $sum: { $ifNull: ['$refundedTotal', 0] } },
                canceledCount: { $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] } },
                firstOrderAt: { $min: '$time' },
                lastOrderAt: { $max: '$time' }
            }
        }
    ])

    console.log(`[userStats] Upserting stats for ${rows.length} users...`)
    let done = 0
    for (const row of rows) {
        const lastOrder = await DL.Order.Model.findOne(
            { userId: row._id },
            { _id: 0, id: 1, number: 1 }
        ).sort({ time: -1 }).lean().catch(() => null)
        await DL.UserStat.Model.updateOne(
            { userId: String(row._id) },
            {
                $set: {
                    userId: String(row._id),
                    domainId: row.domainId,
                    ordersCount: row.ordersCount,
                    totalPaid: round2(Number(row.totalPaid) || 0),
                    refundedTotal: round2(Number(row.refundedTotal) || 0),
                    canceledCount: row.canceledCount || 0,
                    firstOrderAt: row.firstOrderAt,
                    lastOrderAt: row.lastOrderAt,
                    lastOrderId: lastOrder?.id,
                    lastOrderNumber: lastOrder?.number
                }
            },
            { upsert: true }
        ).catch(() => { })
        if (++done % 500 === 0) console.log(`[userStats] ...${done}/${rows.length}`)
    }
    console.log(`[userStats] Done — ${done} users`)
}
