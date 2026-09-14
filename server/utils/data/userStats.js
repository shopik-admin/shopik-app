import { round2 } from '#common/functions/calcOrder/utils.js'

// Central place for maintaining the user_stats collection.
// All helpers are best-effort: stats must never block payment flows,
// so callers don't need their own try/catch.

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
