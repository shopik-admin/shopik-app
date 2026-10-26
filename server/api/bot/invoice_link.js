import resolveBotUser from '#server/utils/auth/resolveBotUser.js'

/**
 * POST /api/bot/invoice_link
 * Auth: API key with `bot:invoice` permission (router enforces).
 * Body: { orderNumber, userToken }
 * - Ownership enforced via userToken (per dev spec: user token +
 *   order number required).
 * - The document is the one issued by EZcount at capture and stored on the
 *   Invoice collection. No provider call is made here, so a bot request can
 *   never create a document.
 * Returns: { url, number, status }
 */
export default async function invoice_link(payload, info) {
    const { DL, utils } = info
    const { orderNumber, userToken, domainId } = payload || {}
    if (orderNumber == null) throw { status: 400, message: 'orderNumber required' }

    const user = await resolveBotUser({ DL, utils, domainId, userToken })

    const order = await DL.Order.readOne({ number: orderNumber })
    if (!order) throw { status: 404, message: 'Order not found' }
    if (String(order.userId) !== String(user.id))
        throw { status: 403, message: 'Not your order' }

    const record = await DL.Invoice
        .readOne({ orderId: order.id, kind: 'invoice', status: 'issued' })
        .catch(() => null)

    if (!record?.docUrl) {
        // Legacy orders keep the link stored on the order.
        if (order.invoice?.url)
            return { url: order.invoice.url, number: order.invoice.number, status: 'issued', legacy: true }
        throw { status: 404, message: 'No invoice available yet' }
    }

    try {
        const { record: recordEvent, userActor } = utils.data.timeline
        await recordEvent({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.INVOICE_OPEN,
            actor: userActor(user),
            context: { step: 'invoice_opened', provider: 'ezcount', docNumber: record.docNumber },
            outcome: { success: true },
            metadata: { source: 'bot/invoice_link' }
        })
    } catch { }

    return { url: record.docUrl, number: record.docNumber, status: record.status }
}

invoice_link.config = {
    auth: 'none',
    permissions: ['bot:invoice'],
    required: ['orderNumber', 'userToken'],
    preventMultiple: (body) => ':' + (body?.orderNumber || '')
}
