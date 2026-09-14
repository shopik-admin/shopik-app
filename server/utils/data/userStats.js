import { round2 } from '#common/functions/calcOrder/utils.js'

// Central place for maintaining the user_stats collection.
// All helpers are best-effort: stats must never block payment flows,
// so callers don't need their own try/catch.

// Orders in these statuses count toward user stats (everything past cart).
export const COUNTED_STATUSES = ['paid', 'picking', 'picked', 'packed', 'shipped', 'done', 'canceled']

// Single-pass aggregation over orders: one pipeline, no per-user queries.
// $sort ascending + $last yields the latest order's id/number for free.
export function userStatsAggregation() {
    return [
        { $match: { userId: { $exists: true, $ne: null }, status: { $in: COUNTED_STATUSES } } },
        { $sort: { time: 1 } },
        {
            $group: {
                _id: '$userId',
                domainId: { $last: '$domainId' },
                ordersCount: { $sum: 1 },
                totalPaid: { $sum: { $ifNull: ['$finalSumWithShipping', { $ifNull: ['$finalSum', 0] }] } },
                refundedTotal: { $sum: { $ifNull: ['$refundedTotal', 0] } },
                canceledCount: { $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] } },
                firstOrderAt: { $min: '$time' },
                lastOrderAt: { $max: '$time' },
                lastOrderId: { $last: '$id' },
                lastOrderNumber: { $last: '$number' }
            }
        }
    ]
}

// Map one aggregation row to a user_stats doc (shared by sync route + CLI).
export function statsDocFromRow(row) {
    return {
        userId: String(row._id),
        domainId: row.domainId,
        ordersCount: row.ordersCount,
        totalPaid: round2(Number(row.totalPaid) || 0),
        refundedTotal: round2(Number(row.refundedTotal) || 0),
        canceledCount: row.canceledCount || 0,
        firstOrderAt: row.firstOrderAt,
        lastOrderAt: row.lastOrderAt,
        lastOrderId: row.lastOrderId,
        lastOrderNumber: row.lastOrderNumber
    }
}

export async function recordPaidOrder(DL, order, amount) {
    try {
        const userId = order?.userId
        if (!userId || !DL?.UserStat?.Model) return
        const paidAt = new Date()
        const value = round2(Number(amount ?? order?.finalSumWithShipping ?? order?.finalSum ?? 0) || 0)
        if (!(value > 0)) return
        await DL.UserStat.Model.updateOne(
            { userId: String(userId) },
            {
                $setOnInsert: { userId: String(userId), domainId: order.domainId, firstOrderAt: paidAt },
                $set: { lastOrderAt: paidAt, lastOrderId: order.id, lastOrderNumber: order.number, domainId: order.domainId },
                $min: { firstOrderAt: paidAt },
                $inc: { ordersCount: 1, totalPaid: value }
            },
            { upsert: true }
        )
    } catch { }
}

export async function adjustPaidTotal(DL, order, delta) {
    try {
        const userId = order?.userId
        if (!userId || !DL?.UserStat?.Model) return
        const value = round2(Number(delta || 0))
        if (!value) return
        await DL.UserStat.Model.updateOne(
            { userId: String(userId) },
            { $inc: { totalPaid: value }, $set: { lastOrderAt: new Date(), lastOrderId: order.id } },
            { upsert: true }
        )
    } catch { }
}

export async function recordCancel(DL, order, amount) {
    try {
        const userId = order?.userId
        if (!userId || !DL?.UserStat?.Model) return
        const value = round2(Number(amount ?? order?.payment?.authorizedAmount ?? order?.finalSumWithShipping ?? order?.finalSum ?? 0) || 0)
        const inc = { canceledCount: 1 }
        if (value > 0) {
            inc.ordersCount = -1
            inc.totalPaid = -value
        }
        await DL.UserStat.Model.updateOne(
            { userId: String(userId) },
            { $inc: inc },
            { upsert: true }
        )
    } catch { }
}

export async function recordRefund(DL, order, amount) {
    try {
        const userId = order?.userId
        if (!userId || !DL?.UserStat?.Model) return
        const value = round2(Number(amount || 0))
        if (!(value > 0)) return
        await DL.UserStat.Model.updateOne(
            { userId: String(userId) },
            { $inc: { refundedTotal: value } },
            { upsert: true }
        )
    } catch { }
}
