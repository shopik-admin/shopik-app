import resolveBotUser from '#server/utils/auth/resolveBotUser.js'

/**
 * POST /api/bot/invoice_link
 * Auth: API key with `bot:invoice` permission (router enforces).
 * Body: { orderNumber, userToken, providerTxnId? }
 * - Ownership enforced via userToken (per dev spec: user token +
 *   order number required).
 * - Invoices are issued via HYP (PrintHesh) only — NOT Komax
 *   (Komax integration is catalog-only). Reuses the same lookup,
 *   cache and single-issuance logic as payment/invoice.
 * Returns: { url, providerTxnId, cached }
 */
export default async function invoice_link(payload, info) {
    const { DL, external, utils } = info
    const { orderNumber, userToken, phone, domainId, providerTxnId: wantedTxnId } = payload || {}
    if (orderNumber == null) throw { status: 400, message: 'orderNumber required' }

    const user = await resolveBotUser({ DL, utils, domainId, userToken, phone })

    const order = await DL.Order.readOne({ number: orderNumber })
    if (!order) throw { status: 404, message: 'Order not found' }
    if (String(order.userId) !== String(user.id))
        throw { status: 403, message: 'Not your order' }

    // --- same resolution as payment/invoice.js ---
    let providerTxnId = null
    let cachedUrl = null

    if (wantedTxnId) {
        let wanted = null
        try {
            const found = await DL.PaymentTransaction.read(
                { orderId: order.id, providerTxnId: String(wantedTxnId), status: 'success' },
                { _id: 0, providerTxnId: 1, invoiceUrl: 1 }
            )
            if (Array.isArray(found) && found[0]) wanted = found[0]
        } catch { }
        if (!wanted?.providerTxnId) throw { status: 404, message: 'Transaction not found for this order' }
        providerTxnId = wanted.providerTxnId
        cachedUrl = wanted.invoiceUrl || null
    }

    if (!providerTxnId) providerTxnId = order.payment?.captureProviderTxnId || order.payment?.providerTxnId
    if (!providerTxnId) {
        let txn = null
        try {
            const Model = DL.PaymentTransaction?.Model
            if (Model) {
                txn = await Model.findOne({ orderId: order.id, status: 'success', kind: { $in: ['capture', 'auth'] } }).sort({ createdAt: -1 }).lean()
                if (!txn)
                    txn = await Model.findOne({ orderId: order.id, status: 'success' }).sort({ createdAt: -1 }).lean()
            }
        } catch { }
        if (!txn) {
            try {
                const list = await DL.PaymentTransaction.read({ orderId: order.id, status: 'success' }, { _id: 0 }, { sort: { createdAt: -1 }, limit: 1 })
                if (Array.isArray(list) && list[0]) txn = list[0]
            } catch { }
        }
        if (!txn?.providerTxnId)
            throw { status: 404, message: 'No invoice available yet' }
        providerTxnId = txn?.providerTxnId
        cachedUrl = txn?.invoiceUrl || null
    }

    if (cachedUrl) return { url: cachedUrl, providerTxnId: String(providerTxnId), cached: true }

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

    return { url, providerTxnId: String(providerTxnId) }
}

invoice_link.config = {
    auth: 'none',
    permissions: ['bot:invoice'],
    required: ['orderNumber'],
    preventMultiple: (body) => ':' + (body?.providerTxnId || body?.orderNumber || '')
}
