// Successful refunds of one order (for per-refund invoice links).
export default async function refunds({ orderId }, { DL }) {
    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'Order not found' }
    const txns = await DL.PaymentTransaction.read(
        { orderId: order.id, kind: 'refund', status: 'success' },
        { _id: 0, providerTxnId: 1, amount: 1, createdAt: 1, reason: 1 },
        { sort: { createdAt: 1 } }
    )
    return (txns || [])
        .filter(t => t?.providerTxnId)
        .map(t => ({
            providerTxnId: String(t.providerTxnId),
            amount: Number(t.amount || 0),
            createdAt: t.createdAt,
            reason: t.reason
        }))
}

refunds.config = {
    required: ['orderId'],
    permissions: ['order:payment']
}
