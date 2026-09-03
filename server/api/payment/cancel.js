export default async function cancel(payload, info) {
    const { DL, external, utils, _admin } = info
    const { orderId } = payload

    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'Order not found' }
    if (order.status === DL.Order.constants.ORDER_STATUS.CANCELED) throw { status: 400, message: 'Order already canceled' }

    const { record, adminActor } = utils.data.timeline
    const hasCapture = Boolean(order.paid && order.payment?.captureProviderTxnId)
    const hasAuth = Boolean(order.payment?.providerTxnId)

    if (!hasAuth && !hasCapture) throw { status: 400, message: 'No payment to cancel' }

    // Case 1: only J5 hold, no capture
    if (!hasCapture && hasAuth) {
        const targetId = String(order.payment.providerTxnId)
        let res
        try {
            res = await external.hyp.cancel({ providerTxnId: targetId })
        } catch (e) {
            throw { status: e.status || 502, message: e.message || 'Cancel failed' }
        }
        const okCodes = [0]
        const isOk = okCodes.includes(Number(res.CCode)) || Number(res.ReversalStatus) === 777
        if (!isOk && Number(res.CCode) !== 0) {
            const msg = external.hyp.ccodeMessage(res.CCode)
            await DL.PaymentTransaction.create({
                domainId: order.domainId, storeId: order.storeId,
                orderId: order.id, orderNumber: order.number, userId: order.userId,
                provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CANCEL,
                status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.FAILED,
                amount: order.payment.authorizedAmount, providerTxnId: targetId, providerCode: res.CCode, providerData: res, error: msg
            }).catch(() => { })
            await record({
                DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                actor: adminActor(_admin),
                context: { step: 'payment_canceled_hold_released', provider: 'hyp', providerTxnId: targetId },
                outcome: { success: false, errorMessage: msg },
                metadata: { source: 'payment/cancel' }
            })
            throw { status: 502, message: msg }
        }
        await DL.PaymentTransaction.create({
            domainId: order.domainId, storeId: order.storeId,
            orderId: order.id, orderNumber: order.number, userId: order.userId,
            provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CANCEL,
            status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
            amount: order.payment.authorizedAmount, providerTxnId: targetId, providerCode: 0, providerData: res
        }).catch(() => { })
        await DL.Order.updateOne({ id: order.id }, { status: DL.Order.constants.ORDER_STATUS.CANCELED, cancelDate: new Date(), paymentError: null })
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
            actor: adminActor(_admin),
            context: { step: 'payment_canceled_hold_released', provider: 'hyp', providerTxnId: targetId, amount: order.payment.authorizedAmount },
            changes: { oldData: { status: order.status }, newData: { status: 'canceled' } },
            outcome: { success: true },
            metadata: { source: 'payment/cancel' }
        })
        return { canceled: true, mode: 'hold_released' }
    }

    // Case 2 & 3: has capture — try CancelTrans first, on 920 fallback to full refund
    const captureId = String(order.payment.captureProviderTxnId)
    let cancelRes
    try {
        cancelRes = await external.hyp.cancel({ providerTxnId: captureId })
    } catch (e) {
        cancelRes = { CCode: 920, error: e.message }
    }

    const cancelOk = Number(cancelRes.CCode) === 0 || Number(cancelRes.ReversalStatus) === 777
    if (cancelOk) {
        await DL.PaymentTransaction.create({
            domainId: order.domainId, storeId: order.storeId,
            orderId: order.id, orderNumber: order.number, userId: order.userId,
            provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CANCEL,
            status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
            amount: order.finalSumWithShipping ?? order.finalSum,
            providerTxnId: captureId, providerCode: 0, providerData: cancelRes
        }).catch(() => { })
        await DL.Order.updateOne({ id: order.id }, { status: DL.Order.constants.ORDER_STATUS.CANCELED, cancelDate: new Date(), paymentError: null })
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
            actor: adminActor(_admin),
            context: { step: 'payment_canceled', provider: 'hyp', providerTxnId: captureId },
            changes: { oldData: { status: order.status }, newData: { status: 'canceled' } },
            outcome: { success: true },
            metadata: { source: 'payment/cancel' }
        })
        return { canceled: true, mode: 'cancel_trans' }
    }

    if (Number(cancelRes.CCode) === 920) {
        // fallback: refund entire remaining amount
        const remaining = Number((order.finalSumWithShipping ?? order.finalSum ?? 0) - (order.refundedTotal || 0))
        if (remaining <= 0.001) {
            await DL.Order.updateOne({ id: order.id }, { status: DL.Order.constants.ORDER_STATUS.CANCELED, cancelDate: new Date() })
            return { canceled: true, mode: 'already_refunded' }
        }
        let refundRes
        try {
            refundRes = await external.hyp.refund({ providerTxnId: captureId, amount: remaining })
        } catch (e) {
            throw { status: e.status || 502, message: e.message || 'Refund fallback failed' }
        }
        if (Number(refundRes.CCode) !== 0) {
            const msg = external.hyp.ccodeMessage(refundRes.CCode)
            await record({
                DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
                actor: adminActor(_admin),
                context: { step: 'refund_failed', provider: 'hyp', parentProviderTxnId: captureId, amount: remaining },
                outcome: { success: false, errorMessage: msg },
                metadata: { source: 'payment/cancel:refund_fallback' }
            })
            throw { status: 502, message: msg }
        }
        const newId = refundRes.Id ? String(refundRes.Id) : undefined
        await DL.PaymentTransaction.create({
            domainId: order.domainId, storeId: order.storeId,
            orderId: order.id, orderNumber: order.number, userId: order.userId,
            provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.REFUND,
            status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
            amount: remaining, providerTxnId: newId, parentProviderTxnId: captureId, providerCode: 0, providerData: refundRes, reason: 'cancel_fallback_refund'
        }).catch(() => { })
        const prevRefunded = Number(order.refundedTotal || 0)
        await DL.Order.Model.updateOne({ id: order.id }, { $inc: { refundedTotal: remaining } }).catch(() => { })
        await DL.Order.Model.updateOne({ id: order.id }, { finalSumAfterRefunds: Number((order.finalSumWithShipping ?? 0) - (prevRefunded + remaining)) }).catch(() => { })
        await DL.Order.updateOne({ id: order.id }, { status: DL.Order.constants.ORDER_STATUS.CANCELED, cancelDate: new Date() })
        await record({
            DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
            actor: adminActor(_admin),
            context: { step: 'refund', provider: 'hyp', providerTxnId: newId, parentProviderTxnId: captureId, amount: remaining, reason: 'cancel_fallback_refund' },
            changes: { oldData: { refundedTotal: prevRefunded }, newData: { refundedTotal: prevRefunded + remaining } },
            outcome: { success: true },
            metadata: { source: 'payment/cancel:refund_fallback' }
        })
        await record({
            DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
            actor: adminActor(_admin),
            context: { step: 'payment_canceled', provider: 'hyp', providerTxnId: newId },
            changes: { oldData: { status: order.status }, newData: { status: 'canceled' } },
            outcome: { success: true },
            metadata: { source: 'payment/cancel' }
        })
        return { canceled: true, mode: 'refund_fallback', refunded: remaining, providerTxnId: newId }
    }

    const msg = external.hyp.ccodeMessage(cancelRes.CCode)
    throw { status: 502, message: msg }
}

cancel.config = {
    required: ['orderId'],
    permissions: ['order:payment'],
    preventMultiple: (body) => ':' + body.orderId
}
