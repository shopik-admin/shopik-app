export default async function capture(payload, info) {
    const { DL, external, utils, _admin } = info
    const { orderId } = payload

    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'Order not found' }
    if (order.paid) throw { status: 400, message: 'Order already captured' }
    if (!order.payment?.cardToken) throw { status: 400, message: 'No payment token on order' }

    const amount = order.finalSumWithShipping ?? order.finalSum ?? order.sum
    const authorized = Number(order.payment.authorizedAmount || amount)
    const captureAmount = Number(amount)
    const overCaptureAllowed = String(process.env.HYP_OVER_CAPTURE || 'false').toLowerCase() === 'true'
    const needsSplit = captureAmount > authorized && !overCaptureAllowed

    const { record, adminActor } = utils.data.timeline

    if (needsSplit) {
        const split = await external.hyp.captureOverCaptureSplit({ order, captureAmount })
        const primary = split.primary
        if (!primary || Number(primary.CCode) !== 0) {
            const msg = external.hyp.ccodeMessage(primary?.CCode)
            await DL.Order.updateOne({ id: order.id }, { paymentError: msg })
            await DL.PaymentTransaction.create({
                domainId: order.domainId, storeId: order.storeId,
                orderId: order.id, orderNumber: order.number, userId: order.userId,
                provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CAPTURE,
                status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.FAILED,
                amount: captureAmount, providerCode: primary?.CCode, parentProviderTxnId: order.payment.providerTxnId, providerData: primary, error: msg
            }).catch(() => { })
            await record({
                DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                actor: adminActor(_admin),
                context: { step: 'payment_capture_failed', provider: 'hyp', providerCode: primary?.CCode, amount: captureAmount, authorizedAmount: authorized },
                outcome: { success: false, errorMessage: msg },
                metadata: { source: 'payment/capture' }
            })
            throw { status: 502, message: msg }
        }
        const capturedAt = new Date()
        const captureTxnId = primary.Id ? String(primary.Id) : undefined
        await DL.PaymentTransaction.create({
            domainId: order.domainId, storeId: order.storeId,
            orderId: order.id, orderNumber: order.number, userId: order.userId,
            provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CAPTURE,
            status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
            amount: authorized, terminalId: process.env.HYP_MASOF || undefined,
            providerTxnId: captureTxnId, parentProviderTxnId: order.payment.providerTxnId, providerCode: 0, providerData: primary
        })
        await record({
            DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
            actor: adminActor(_admin),
            context: { step: 'payment_captured', provider: 'hyp', providerTxnId: captureTxnId, parentProviderTxnId: order.payment.providerTxnId, amount: authorized, authorizedAmount },
            outcome: { success: true }, metadata: { source: 'payment/capture' }
        })
        let finalCaptureId = captureTxnId
        const secondary = split.secondary
        if (secondary && Number(secondary.CCode) === 0) {
            const secondId = secondary.Id ? String(secondary.Id) : undefined
            await DL.PaymentTransaction.create({
                domainId: order.domainId, storeId: order.storeId,
                orderId: order.id, orderNumber: order.number, userId: order.userId,
                provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CAPTURE,
                status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
                amount: split.overflow, providerTxnId: secondId, parentProviderTxnId: order.payment.providerTxnId, providerCode: 0, providerData: secondary
            })
            await record({
                DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                actor: adminActor(_admin),
                context: { step: 'payment_captured_overflow', provider: 'hyp', providerTxnId: secondId, amount: split.overflow },
                outcome: { success: true }, metadata: { source: 'payment/capture:overflow' }
            })
            finalCaptureId = secondId || captureTxnId
        }
        await DL.Order.updateOne({ id: order.id }, { paid: true, paidAt: capturedAt, 'payment.capturedAt': capturedAt, 'payment.captureProviderTxnId': finalCaptureId, paymentError: null })
        return { captured: true, amount: captureAmount, captureProviderTxnId: finalCaptureId, split: true }
    }

    const result = await external.hyp.capture({ order, amount: captureAmount })
    if (Number(result.CCode) !== 0) {
        const msg = external.hyp.ccodeMessage(result.CCode)
        await DL.Order.updateOne({ id: order.id }, { paymentError: msg })
        await DL.PaymentTransaction.create({
            domainId: order.domainId, storeId: order.storeId,
            orderId: order.id, orderNumber: order.number, userId: order.userId,
            provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CAPTURE,
            status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.FAILED,
            amount: captureAmount, providerTxnId: result.Id ? String(result.Id) : undefined, parentProviderTxnId: order.payment.providerTxnId,
            providerCode: result.CCode, providerData: result, error: msg
        }).catch(() => { })
        await record({
            DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
            actor: adminActor(_admin),
            context: { step: 'payment_capture_failed', provider: 'hyp', providerCode: result.CCode, amount: captureAmount, authorizedAmount: authorized },
            outcome: { success: false, errorMessage: msg },
            metadata: { source: 'payment/capture' }
        })
        throw { status: 502, message: msg }
    }

    const captureTxnId = result.Id ? String(result.Id) : undefined
    const capturedAt = new Date()
    await DL.PaymentTransaction.create({
        domainId: order.domainId, storeId: order.storeId,
        orderId: order.id, orderNumber: order.number, userId: order.userId,
        provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CAPTURE,
        status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
        amount: captureAmount, terminalId: process.env.HYP_MASOF || undefined,
        providerTxnId: captureTxnId, parentProviderTxnId: order.payment.providerTxnId, providerCode: 0, providerData: result
    })
    await DL.Order.updateOne({ id: order.id }, { paid: true, paidAt: capturedAt, 'payment.capturedAt': capturedAt, 'payment.captureProviderTxnId': captureTxnId, paymentError: null })
    await record({
        DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
        actor: adminActor(_admin),
        context: { step: 'payment_captured', provider: 'hyp', providerTxnId: captureTxnId, parentProviderTxnId: order.payment.providerTxnId, amount: captureAmount, authorizedAmount },
        outcome: { success: true }, metadata: { source: 'payment/capture' }
    })

    return { captured: true, amount: captureAmount, captureProviderTxnId: captureTxnId }
}

capture.config = {
    required: ['orderId'],
    permissions: ['order:payment'],
    preventMultiple: (body) => ':' + body.orderId
}
