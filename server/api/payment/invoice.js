/**
 * GET/POST /api/payment/invoice
 *
 * Serves the document stored on the order / Invoice collection. There is no
 * on-demand fallback to the payment provider: an invoice only exists after the
 * capture issued it, so this endpoint can never produce a document for an
 * uncharged order.
 */
export default async function invoice(payload, info) {
    const { DL, utils, _admin, _user, query } = info
    const body = payload || {}
    const q = query || {}
    const orderId = body.orderId || q.orderId || q.order_id
    if (!orderId) throw { status: 400, message: 'orderId required' }
    const wantedTxnId = body.providerTxnId || q.providerTxnId

    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'Order not found' }

    // auth: admin with transaction:read can view any; otherwise user must own order
    let isAdmin = false
    if (_admin) {
        try { isAdmin = _admin.hasPermission('invoice:read') || _admin.hasPermission('transaction:read') || _admin.hasPermission('payment_transaction:read') || _admin.hasPermission('order:payment') } catch { isAdmin = false }
        if (!isAdmin && _admin.hasPermission) {
            try { isAdmin = _admin.hasPermission('admin:super') } catch { }
        }
    }
    if (!isAdmin) {
        if (!_user) throw { status: 401, message: 'Unauthorized' }
        if (String(order.userId) !== String(_user.id)) throw { status: 403, message: 'Not your order' }
    }

    let record = null

    // A specific transaction was requested: return the document linked to it
    // (a credit note for a refund, or the invoice for a capture leg).
    if (wantedTxnId) {
        const txn = await DL.PaymentTransaction
            .readOne({ orderId: order.id, providerTxnId: String(wantedTxnId) }, { _id: 0, invoiceId: 1, creditInvoiceId: 1 })
            .catch(() => null)
        if (!txn) throw { status: 404, message: 'Transaction not found for this order' }
        const invoiceId = txn.creditInvoiceId || txn.invoiceId
        if (invoiceId) record = await DL.Invoice.readById(invoiceId).catch(() => null)
    }

    if (!record) {
        record = await DL.Invoice
            .readOne({ orderId: order.id, kind: 'invoice', status: 'issued' })
            .catch(() => null)
    }

    // Legacy orders issued through Hyp keep their stored link for viewing.
    if (!record && order.invoice?.url) {
        const result = {
            url: order.invoice.url,
            number: order.invoice.number,
            status: 'issued',
            legacy: true,
            vatBreakdown: order.vatBreakdown || null
        }
        await recordOpen({ DL, utils, order, actor: _admin ? utils.data.timeline.adminActor(_admin) : utils.data.timeline.userActor(_user), source: 'payment/invoice' })
        return result
    }

    if (!record) throw { status: 404, message: 'No invoice available yet' }

    await recordOpen({ DL, utils, order, actor: _admin ? utils.data.timeline.adminActor(_admin) : utils.data.timeline.userActor(_user), source: 'payment/invoice' })

    const credits = await DL.Invoice
        .read({ orderId: order.id, kind: 'credit', status: 'issued' }, { _id: 0 })
        .catch(() => [])

    return {
        url: record.docUrl,
        number: record.docNumber,
        docId: record.docId,
        status: record.status,
        kind: record.kind,
        amount: record.amount,
        vatBreakdown: record.vatBreakdown || order.vatBreakdown || null,
        credits: (credits || []).map(c => ({
            number: c.docNumber, url: c.docUrl, amount: c.amount, issuedAt: c.issuedAt
        })),
        cached: true
    }
}

async function recordOpen({ DL, utils, order, actor, source }) {
    try {
        const { record } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.INVOICE_OPEN,
            actor,
            context: { step: 'invoice_opened', provider: 'ezcount' },
            outcome: { success: true },
            metadata: { source }
        })
    } catch { }
}

invoice.config = {
    log: true,
    preventMultiple: (body) => ':' + (body?.providerTxnId || body?.orderId || '')
}
