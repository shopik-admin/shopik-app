import resolveBotUser from '#server/utils/auth/resolveBotUser.js'

/**
 * POST /api/bot/invoice_link
 * Auth: API key with `bot:invoice` permission (router enforces).
 * Body: { orderNumber, userToken }
 * - Ownership enforced via userToken (per dev spec: user token +
 *   order number required).
 * - Invoices are issued for the capture transaction only
 *   (order.payment.captureProviderTxnId) via HYP
 *   (Komax integration is catalog-only).
 * Returns: { url }
 */
export default async function invoice_link(payload, info) {
    const { DL, external, utils } = info
    const { orderNumber, userToken, domainId } = payload || {}
    if (orderNumber == null) throw { status: 400, message: 'orderNumber required' }

    const user = await resolveBotUser({ DL, utils, domainId, userToken })

    const order = await DL.Order.readOne({ number: orderNumber })
    if (!order) throw { status: 404, message: 'Order not found' }
    if (String(order.userId) !== String(user.id))
        throw { status: 403, message: 'Not your order' }

    // Capture-only: the invoice belongs to the capture transaction.
    const providerTxnId = order.payment?.captureProviderTxnId
    if (!providerTxnId)
        throw { status: 404, message: 'No invoice available yet' }

    // Single issuance: serve the stored doc when present.
    try {
        const txn = await DL.PaymentTransaction.readOne(
            { orderId: order.id, providerTxnId: String(providerTxnId) },
            { _id: 0, invoiceUrl: 1 }
        )
        if (txn?.invoiceUrl) return { url: txn.invoiceUrl }
    } catch { }

    let url
    try {
        url = await external.hyp.invoiceLink(String(providerTxnId))
    } catch (e) {
        throw { status: e.status || 502, message: e.message || 'Failed to generate invoice link' }
    }
    try {
        await DL.PaymentTransaction?.Model?.updateOne(
            { orderId: order.id, providerTxnId: String(providerTxnId) },
            { invoiceUrl: url }
        )
    } catch { }

    try {
        const { record, userActor } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.INVOICE_OPEN,
            actor: userActor(user),
            context: { step: 'invoice_opened', provider: 'hyp', providerTxnId: String(providerTxnId) },
            outcome: { success: true },
            metadata: { source: 'bot/invoice_link' }
        })
    } catch { }

    return { url }
}

invoice_link.config = {
    auth: 'none',
    permissions: ['bot:invoice'],
    required: ['orderNumber', 'userToken'],
    preventMultiple: (body) => ':' + (body?.orderNumber || '')
}
