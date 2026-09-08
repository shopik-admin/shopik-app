import { validateRefundRequest, round2, getChargedSum } from '#common/functions/refundCalc.js'
import { planRefundLegs, executeRefundPlan, distributeCoveredAmount } from '#server/utils/data/refundCaptures.js'

// Persist covered money onto the order: per-line refundedAmount (+shipping),
// refundedTotal and finalSumAfterRefunds. coveredItems must sum to coveredTotal.
async function applyRefundAccounting({ DL, order, coveredItems, coveredTotal }) {
    const Model = DL.Order.Model
    for (const ri of coveredItems) {
        if (ri.productId === '__shipping' || !(Number(ri.amount || 0) > 0)) continue
        let matched = false
        try {
            const res = await Model.updateOne(
                { id: order.id, 'cart.id': ri.productId },
                { $inc: { 'cart.$.refundedAmount': ri.amount } }
            )
            matched = Number(res?.matchedCount ?? res?.n ?? 1) > 0
        } catch { matched = false }
        if (!matched) {
            // fallback by barcode if id not matched (legacy lines)
            await Model.updateOne(
                { id: order.id, 'cart.barcode': ri.barcode },
                { $inc: { 'cart.$.refundedAmount': ri.amount } }
            ).catch(() => { })
        }
    }
    const shipCovered = Number((coveredItems.find(i => i.productId === '__shipping') || {}).amount || 0)
    const incOps = { refundedTotal: coveredTotal }
    if (shipCovered > 0) incOps.refundedShipping = shipCovered
    await Model.updateOne({ id: order.id }, { $inc: incOps }).catch(() => { })
    const prevRefunded = Number(order.refundedTotal || 0)
    const newRefunded = round2(prevRefunded + coveredTotal)
    const finalSumAfter = round2(getChargedSum(order) - newRefunded)
    await Model.updateOne({ id: order.id }, { finalSumAfterRefunds: finalSumAfter }).catch(() => { })
    return { prevRefunded, newRefunded }
}

// Register a credit performed manually via Hyp Console against a
// cancel-through remainder (order.refundPending). No provider call.
async function manualRefund({ DL, utils, _admin, order, amount, reason }) {
    const CANCELED = DL.Order.constants.ORDER_STATUS.CANCELED
    if (order.status !== CANCELED) throw { status: 400, message: 'Manual refund is only for canceled orders' }
    const pending = round2(Number(order.refundPending || 0))
    const manualAmount = round2(Number(amount || 0))
    if (!(manualAmount > 0)) throw { status: 400, message: 'Refund total must be > 0' }
    if (manualAmount - pending > 0.001) throw { status: 400, message: `Manual refund exceeds pending amount (${pending})` }
    const { record, adminActor } = utils.data.timeline
    await DL.PaymentTransaction.create({
        domainId: order.domainId, storeId: order.storeId,
        orderId: order.id, orderNumber: order.number, userId: order.userId,
        provider: 'manual', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.REFUND,
        status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
        amount: manualAmount, providerCode: 0, providerData: { manual: true }, reason, items: []
    })
    const Model = DL.Order.Model
    await Model.updateOne({ id: order.id }, { $inc: { refundedTotal: manualAmount, refundPending: -manualAmount } }).catch(() => { })
    const prevRefunded = Number(order.refundedTotal || 0)
    const newRefunded = round2(prevRefunded + manualAmount)
    await Model.updateOne({ id: order.id }, { finalSumAfterRefunds: round2(getChargedSum(order) - newRefunded) }).catch(() => { })
    await record({
        DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
        actor: adminActor(_admin),
        context: { step: 'refund_manual', provider: 'manual', amount: manualAmount, reason },
        changes: { oldData: { refundedTotal: prevRefunded, refundPending: pending }, newData: { refundedTotal: newRefunded, refundPending: round2(pending - manualAmount) } },
        outcome: { success: true },
        metadata: { source: 'payment/refund', referenceOrderNumber: order.number }
    })
    return { refunded: manualAmount, manual: true, refundedTotal: newRefunded, pendingRefund: round2(pending - manualAmount) }
}

export default async function refund(payload, info) {
    const { DL, external, utils, _admin } = info
    const { orderId, items = [], shippingAmount = 0, reason, manual = false, amount = 0 } = payload

    const ship = round2(Number(shippingAmount || 0))
    const list = Array.isArray(items) ? items : []
    if (!manual && list.length === 0 && !(ship > 0)) throw { status: 400, message: 'items required' }

    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'Order not found' }
    if (manual) return await manualRefund({ DL, utils, _admin, order, amount, reason })
    if (!order.paid) throw { status: 400, message: 'Order not captured yet' }
    if (!order.payment?.captureProviderTxnId) throw { status: 400, message: 'No capture transaction on order' }
    if (order.status === DL.Order.constants.ORDER_STATUS.CANCELED) throw { status: 400, message: 'Order already canceled' }

    // Authoritative coupon-aware validation (flat coupon: full line price,
    // percent coupon: proportional share; shipping capped separately;
    // global total capped by actually charged sum). See refundCalc.js.
    const { totalRefund, errors } = validateRefundRequest(order, list, ship)
    if (errors.length > 0) throw { status: 400, message: errors[0] }

    // per-line lookup for audit rows
    const cartById = new Map(order.cart.map(l => [String(l.id), l]))
    const cartByBarcode = new Map(order.cart.map(l => [String(l.barcode), l]))
    const refundItems = []
    for (const it of list) {
        const line = cartById.get(String(it.productId)) || cartByBarcode.get(String(it.productId))
        if (!line) throw { status: 400, message: `Product ${it.productId} not in order` }
        refundItems.push({
            productId: String(it.productId),
            barcode: line.barcode,
            name: line.name,
            amount: round2(Number(it.amount))
        })
    }
    if (ship > 0) {
        refundItems.push({ productId: '__shipping', name: 'shipping', amount: ship })
    }

    // needsSplit orders were captured in 2+ legs — distribute the refund
    // across the legs' remaining credit instead of charging one leg.
    const { record, adminActor } = utils.data.timeline
    const { plan, legsTotal } = await planRefundLegs(DL, order, totalRefund)
    if (!plan || plan.length === 0) {
        const msg = `Refund of ${totalRefund} cannot be covered by captured legs (remaining ${legsTotal}) — a credit may have been issued manually via Hyp Console`
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
            actor: adminActor(_admin),
            context: { step: 'refund_failed', amount: totalRefund, shippingAmount: ship, reason, legsTotal },
            outcome: { success: false, errorMessage: msg },
            metadata: { source: 'payment/refund' }
        })
        throw { status: 400, message: msg }
    }

    const { completed, failed } = await executeRefundPlan({
        DL, external, order, plan, reason, items: refundItems, source: 'payment/refund'
    })
    const coveredTotal = round2(completed.reduce((acc, c) => acc + Number(c.amount || 0), 0))
    const multi = plan.length > 1

    if (failed) {
        // Persist whatever legs actually credited so a retry covers only the rest.
        let newRefunded = Number(order.refundedTotal || 0)
        if (coveredTotal > 0) {
            const coveredItems = distributeCoveredAmount(refundItems, coveredTotal)
            ;({ newRefunded } = await applyRefundAccounting({ DL, order, coveredItems, coveredTotal }))
        }
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
            actor: adminActor(_admin),
            context: {
                step: 'refund_failed', amount: totalRefund, coveredTotal, shippingAmount: ship, reason,
                refunds: completed, failedLeg: { providerTxnId: failed.providerTxnId, amount: failed.amount, providerData: failed.hypRes }
            },
            outcome: { success: false, errorMessage: failed.message },
            metadata: { source: 'payment/refund' }
        })
        throw { status: 502, message: `${failed.message} (refunded ${coveredTotal} of ${totalRefund} before the failure — retry the remainder)` }
    }

    const { prevRefunded, newRefunded } = await applyRefundAccounting({ DL, order, coveredItems: refundItems, coveredTotal: totalRefund })

    await record({
        DL, order,
        eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
        actor: adminActor(_admin),
        context: {
            step: 'refund', provider: 'hyp',
            providerTxnId: completed[0]?.providerTxnId, parentProviderTxnId: completed[0]?.parentProviderTxnId,
            amount: totalRefund, shippingAmount: ship, reason, items: refundItems,
            ...(multi ? { refunds: completed } : {})
        },
        changes: { oldData: { refundedTotal: prevRefunded }, newData: { refundedTotal: newRefunded } },
        outcome: { success: true },
        metadata: { source: 'payment/refund', referenceOrderNumber: order.number }
    })

    return { refunded: totalRefund, providerTxnId: completed[0]?.providerTxnId, refundedTotal: newRefunded, ...(multi ? { refunds: completed } : {}) }
}

refund.config = {
    required: ['orderId'],
    permissions: ['order:payment'],
    preventMultiple: (body) => ':' + body.orderId
}
