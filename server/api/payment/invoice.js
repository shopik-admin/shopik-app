export default async function invoice(payload, info) {
    const { DL, external, utils, _admin, _user, query } = info
    const body = payload || {}
    const q = query || {}
    const orderId = body.orderId || q.orderId || q.order_id
    if (!orderId) throw { status: 400, message: 'orderId required' }

    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'Order not found' }

    // auth: admin with transaction:read can view any; otherwise user must own order
    let isAdmin = false
    if (_admin) {
        try { isAdmin = _admin.hasPermission('transaction:read') || _admin.hasPermission('payment_transaction:read') || _admin.hasPermission('order:payment') } catch { isAdmin = false }
        // also allow super
        if (!isAdmin && _admin.hasPermission) {
            try { isAdmin = _admin.hasPermission('admin:super') } catch { }
        }
    }
    if (!isAdmin) {
        if (!_user) throw { status: 401, message: 'Unauthorized' }
        if (String(order.userId) !== String(_user.id)) throw { status: 403, message: 'Not your order' }
    }

    // find latest successful transaction for invoice (capture preferred, then auth)
    // try PaymentTransaction collection

    // fallback: no PaymentTransaction yet but order has payment.providerTxnId
    let providerTxnId = order.payment?.captureProviderTxnId || order.payment?.providerTxnId
    if (!providerTxnId) {
        let txn = null
        if (!txn) {
            try {
                const Model = DL.PaymentTransaction?.Model
                if (Model) {
                    txn = await Model.findOne({ orderId: order.id, status: 'success', kind: { $in: ['capture', 'auth'] } }).sort({ createdAt: -1 }).lean()
                    if (!txn) {
                        // also check refund? refunds have their own docs, but primary invoice is capture
                        txn = await Model.findOne({ orderId: order.id, status: 'success' }).sort({ createdAt: -1 }).lean()
                    }
                }
            } catch { }
        }

        if (!txn) {
            // fallback via DL read
            try {
                const list = await DL.PaymentTransaction.read({ orderId: order.id, status: 'success' }, { _id: 0 }, { sort: { createdAt: -1 }, limit: 1 })
                if (Array.isArray(list) && list[0]) txn = list[0]
            } catch { }
        }

        if (!txn?.providerTxnId)
            throw { status: 404, message: 'No invoice available yet' }

        providerTxnId = txn?.providerTxnId
    }

    let url
    try {
        url = await external.hyp.invoiceLink(String(providerTxnId))
    } catch (e) {
        throw { status: e.status || 502, message: e.message || 'Failed to generate invoice link' }
    }

    try {
        const { record, adminActor, userActor } = utils.data.timeline
        const actor = _admin ? adminActor(_admin) : userActor(_user)
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.INVOICE_OPEN,
            actor,
            context: { step: 'invoice_opened', provider: 'hyp', providerTxnId: String(providerTxnId) },
            outcome: { success: true },
            metadata: { source: 'payment/invoice' }
        })
    } catch { }

    return { url, providerTxnId: String(providerTxnId) }
}

invoice.config = {
    log: true
}
