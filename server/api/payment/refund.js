import log from '#server/utils/log.js'

export default async function refund(payload, info) {
    const { DL, external, utils, _admin } = info
    const { orderId, items = [], reason } = payload

    if (!Array.isArray(items) || items.length === 0) throw { status: 400, message: 'items required' }

    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'Order not found' }
    if (!order.paid) throw { status: 400, message: 'Order not captured yet' }
    if (!order.payment?.captureProviderTxnId) throw { status: 400, message: 'No capture transaction on order' }

    const totalRefund = items.reduce((sum, it) => sum + Number(it.amount || 0), 0)
    if (!Number.isFinite(totalRefund) || totalRefund <= 0) throw { status: 400, message: 'Refund total must be > 0' }

    const remainingOrder = Number((order.finalSumWithShippingAndHandling ?? order.finalSum ?? order.sum) - (order.refundedTotal || 0))
    if (totalRefund - remainingOrder > 0.001) throw { status: 400, message: `Refund exceeds remaining amount (${remainingOrder})` }

    // per-line validation
    const cartById = new Map(order.cart.map(l => [String(l.id), l]))
    const cartByBarcode = new Map(order.cart.map(l => [String(l.barcode), l]))
    const refundItems = []
    for (const it of items) {
        const line = cartById.get(String(it.productId)) || cartByBarcode.get(String(it.productId))
        if (!line) throw { status: 400, message: `Product ${it.productId} not in order` }
        const refunded = Number(line.refundedAmount || 0)
        const remaining = Number(line.totalSum || 0) - refunded
        const reqAmount = Number(it.amount)
        if (!Number.isFinite(reqAmount) || reqAmount <= 0) throw { status: 400, message: `Invalid amount for ${it.productId}` }
        if (reqAmount - remaining > 0.001) throw { status: 400, message: `Refund for ${line.name || it.productId} exceeds remaining (${remaining})` }
        refundItems.push({
            productId: String(it.productId),
            barcode: line.barcode,
            name: line.name,
            amount: reqAmount
        })
    }

    const captureTxnId = String(order.payment.captureProviderTxnId)

    let hypRes
    try {
        hypRes = await external.hyp.refund({ providerTxnId: captureTxnId, amount: totalRefund })
    } catch (e) {
        const msg = e.message || 'Refund failed'
        const { record, adminActor } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
            actor: adminActor(_admin),
            context: { step: 'refund_failed', provider: 'hyp', parentProviderTxnId: captureTxnId, amount: totalRefund, reason },
            outcome: { success: false, errorMessage: msg },
            metadata: { source: 'payment/refund' }
        }).catch(() => {})
        throw { status: e.status || 502, message: msg }
    }

    if (Number(hypRes.CCode) !== 0) {
        const msg = external.hyp.ccodeMessage(hypRes.CCode)
        await DL.PaymentTransaction.create({
            domainId: order.domainId, storeId: order.storeId,
            orderId: order.id, orderNumber: order.number, userId: order.userId,
            provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.REFUND,
            status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.FAILED,
            amount: totalRefund, parentProviderTxnId: captureTxnId, providerCode: hypRes.CCode, providerData: hypRes, error: msg, reason, items: refundItems
        }).catch(() => {})
        const { record, adminActor } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
            actor: adminActor(_admin),
            context: { step: 'refund_failed', provider: 'hyp', parentProviderTxnId: captureTxnId, amount: totalRefund, reason },
            outcome: { success: false, errorMessage: msg },
            metadata: { source: 'payment/refund' }
        })
        throw { status: 502, message: msg }
    }

    const newProviderTxnId = hypRes.Id ? String(hypRes.Id) : undefined

    await DL.PaymentTransaction.create({
        domainId: order.domainId, storeId: order.storeId,
        orderId: order.id, orderNumber: order.number, userId: order.userId,
        provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.REFUND,
        status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
        amount: totalRefund, providerTxnId: newProviderTxnId, parentProviderTxnId: captureTxnId, providerCode: 0, providerData: hypRes, reason, items: refundItems
    })

    // atomic update: inc refundedTotal, inc per-line refundedAmount, set finalSumAfterRefunds
    const prevRefunded = Number(order.refundedTotal || 0)
    const newRefunded = prevRefunded + totalRefund
    // Build arrayFilters updates for each line
    const arrayFilters = []
    const setOps = {}
    // Mongo update with arrayFilters: need to use bulk update via Model
    const bulkOps = {}
    // fallback: do sequential updates with positional operator via Model.updateOne with arrayFilters
    const Model = DL.Order.Model
    const updateFilter = { id: order.id }
    const updateOps = { $inc: { refundedTotal: totalRefund } }
    // per-line inc
    // Use $[el] syntax: cart.$[el].refundedAmount
    const filters = []
    for (const ri of refundItems) {
        // match by id or barcode
        filters.push({ 'el.id': ri.productId })
        // we will do separate inc? Single $inc with multiple arrayFilters not directly supported for different values.
        // Instead do $inc per line via separate update or use bulk.
    }
    const failedLineUpdates = []
    for (const ri of refundItems) {
        const res = await Model.updateOne(
            { id: order.id, 'cart.id': ri.productId },
            { $inc: { 'cart.$.refundedAmount': ri.amount } }
        ).catch(async () => {
            await Model.updateOne(
                { id: order.id, 'cart.barcode': ri.barcode },
                { $inc: { 'cart.$.refundedAmount': ri.amount } }
            ).catch(() => null)
        })
        if (res?.modifiedCount === 0)
            failedLineUpdates.push(ri.productId)
    }
    const totalRes = await Model.updateOne(updateFilter, updateOps).catch(() => null)
    if (totalRes?.modifiedCount === 0 || failedLineUpdates.length) {
        log.error(`[refund] Order ${order.id}: refund succeeded at provider but local counters not updated`, {
            failedLineUpdates,
            refundedTotalUpdated: totalRes?.modifiedCount > 0
        })
    }
    const finalSumAfter = Number((order.finalSumWithShippingAndHandling ?? order.finalSum ?? 0) - newRefunded)
    await Model.updateOne({ id: order.id }, { finalSumAfterRefunds: finalSumAfter }).catch(() => {})

    const { record, adminActor } = utils.data.timeline
    await record({
        DL, order,
        eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
        actor: adminActor(_admin),
        context: { step: 'refund', provider: 'hyp', providerTxnId: newProviderTxnId, parentProviderTxnId: captureTxnId, amount: totalRefund, reason, items: refundItems },
        changes: { oldData: { refundedTotal: prevRefunded }, newData: { refundedTotal: newRefunded } },
        outcome: { success: true },
        metadata: { source: 'payment/refund', referenceOrderNumber: order.number }
    })

    return { refunded: totalRefund, providerTxnId: newProviderTxnId, refundedTotal: newRefunded }
}

refund.config = {
    required: ['orderId'],
    permissions: ['order:payment'],
    preventMultiple: (body) => ':' + body.orderId
}
