import diff from '#common/functions/diff.js'

const USER_DETAILS_FIELDS = ['name', 'phone', 'phoneB', 'email', 'comment']
const CAPTURE_STATUSES = ['packed']

async function tryCapture({ DL, external, utils, _admin, order }) {
    if (order.paid) return
    if (!order.payment?.cardToken || !order.payment?.cardExpiry) return
    if (!order.payment?.authCode) return
    const amount = order.finalSumWithShippingAndHandling ?? order.finalSum ?? order.sum
    if (!amount || Number(amount) <= 0) return

    const { record, adminActor } = utils.data.timeline
    const authorized = Number(order.payment.authorizedAmount || amount)
    const captureAmount = Number(amount)
    const overCaptureAllowed = String(process.env.HYP_OVER_CAPTURE || 'false').toLowerCase() === 'true'
    const needsSplit = captureAmount > authorized && !overCaptureAllowed

    try {
        let result
        let captureTxnId
        let capturedAt = new Date()

        if (needsSplit) {
            const split = await external.hyp.captureOverCaptureSplit({ order, captureAmount })
            const primary = split.primary
            if (!primary || Number(primary.CCode) !== 0) {
                const msg = external.hyp.ccodeMessage(primary?.CCode)
                await DL.Order.updateOne({ id: order.id }, { paymentError: msg })
                await record({
                    DL, order,
                    eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                    actor: adminActor(_admin),
                    context: { step: 'payment_capture_failed', provider: 'hyp', providerCode: primary?.CCode, amount: captureAmount, authorizedAmount: authorized },
                    outcome: { success: false, errorMessage: msg },
                    metadata: { source: 'order/update:capture', referenceOrderNumber: order.number }
                })
                return
            }
            // primary capture success (authorized part)
            captureTxnId = primary.Id ? String(primary.Id) : undefined
            await DL.PaymentTransaction.create({
                domainId: order.domainId, storeId: order.storeId,
                orderId: order.id, orderNumber: order.number, userId: order.userId,
                provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CAPTURE,
                status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
                amount: authorized,
                terminalId: process.env.HYP_MASOF || undefined,
                providerTxnId: captureTxnId, parentProviderTxnId: order.payment.providerTxnId,
                providerCode: 0, authCode: order.payment.authCode, providerUid: order.payment.providerUid, providerPayerId: order.payment.providerPayerId,
                providerData: primary
            })
            await record({
                DL, order,
                eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                actor: adminActor(_admin),
                context: { step: 'payment_captured', provider: 'hyp', providerTxnId: captureTxnId, parentProviderTxnId: order.payment.providerTxnId, amount: authorized, authorizedAmount },
                changes: { oldData: { paid: false }, newData: { paid: true, capturedAt } },
                outcome: { success: true },
                metadata: { source: 'order/update:capture' }
            })
            // secondary overflow charge
            const secondary = split.secondary
            if (secondary && Number(secondary.CCode) === 0) {
                const secondId = secondary.Id ? String(secondary.Id) : undefined
                await DL.PaymentTransaction.create({
                    domainId: order.domainId, storeId: order.storeId,
                    orderId: order.id, orderNumber: order.number, userId: order.userId,
                    provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CAPTURE,
                    status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
                    amount: split.overflow, providerTxnId: secondId, parentProviderTxnId: order.payment.providerTxnId,
                    providerCode: 0, providerData: secondary
                })
                await record({
                    DL, order,
                    eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                    actor: adminActor(_admin),
                    context: { step: 'payment_captured_overflow', provider: 'hyp', providerTxnId: secondId, amount: split.overflow },
                    outcome: { success: true },
                    metadata: { source: 'order/update:capture:overflow' }
                })
                captureTxnId = secondId || captureTxnId
            } else if (secondary) {
                await record({
                    DL, order,
                    eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                    actor: adminActor(_admin),
                    context: { step: 'payment_capture_failed', provider: 'hyp', providerCode: secondary?.CCode, amount: split.overflow },
                    outcome: { success: false, errorMessage: external.hyp.ccodeMessage(secondary?.CCode) },
                    metadata: { source: 'order/update:capture:overflow' }
                })
            }
            await DL.Order.updateOne({ id: order.id }, { paid: true, paidAt: capturedAt, 'payment.capturedAt': capturedAt, 'payment.captureProviderTxnId': captureTxnId, paymentError: null })
            return
        }

        result = await external.hyp.capture({ order, amount: captureAmount })
        if (Number(result.CCode) !== 0) {
            const msg = external.hyp.ccodeMessage(result.CCode)
            await DL.Order.updateOne({ id: order.id }, { paymentError: msg })
            try {
                await DL.PaymentTransaction.create({
                    domainId: order.domainId, storeId: order.storeId,
                    orderId: order.id, orderNumber: order.number, userId: order.userId,
                    provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CAPTURE,
                    status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.FAILED,
                    amount: captureAmount, providerTxnId: result.Id ? String(result.Id) : undefined, parentProviderTxnId: order.payment.providerTxnId,
                    providerCode: result.CCode, providerData: result, error: msg
                })
            } catch {}
            await record({
                DL, order,
                eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                actor: adminActor(_admin),
                context: { step: 'payment_capture_failed', provider: 'hyp', providerCode: result.CCode, amount: captureAmount, authorizedAmount },
                outcome: { success: false, errorMessage: msg },
                metadata: { source: 'order/update:capture', referenceOrderNumber: order.number }
            })
            return
        }
        captureTxnId = result.Id ? String(result.Id) : undefined
        capturedAt = new Date()
        await DL.PaymentTransaction.create({
            domainId: order.domainId, storeId: order.storeId,
            orderId: order.id, orderNumber: order.number, userId: order.userId,
            provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.CAPTURE,
            status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
            amount: captureAmount, terminalId: process.env.HYP_MASOF || undefined,
            providerTxnId: captureTxnId, parentProviderTxnId: order.payment.providerTxnId,
            providerCode: 0, authCode: order.payment.authCode, providerUid: order.payment.providerUid, providerData: result
        })
        await DL.Order.updateOne({ id: order.id }, { paid: true, paidAt: capturedAt, 'payment.capturedAt': capturedAt, 'payment.captureProviderTxnId': captureTxnId, paymentError: null })
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
            actor: adminActor(_admin),
            context: { step: 'payment_captured', provider: 'hyp', providerTxnId: captureTxnId, parentProviderTxnId: order.payment.providerTxnId, amount: captureAmount, authorizedAmount },
            changes: { oldData: { paid: false }, newData: { paid: true, capturedAt } },
            outcome: { success: true },
            metadata: { source: 'order/update:capture', referenceOrderNumber: order.number }
        })
    } catch (e) {
        const msg = e.message || 'Capture failed'
        await DL.Order.updateOne({ id: order.id }, { paymentError: msg }).catch(() => {})
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
            actor: adminActor(_admin),
            context: { step: 'payment_capture_failed', provider: 'hyp', amount: captureAmount, authorizedAmount },
            outcome: { success: false, errorMessage: msg },
            metadata: { source: 'order/update:capture' }
        }).catch(() => {})
    }
}

export default async function update(payload, { DL, _admin, utils, external }) {
    const { id } = payload

    const order = await DL.Order.readById(id)
    if (!order) throw { status: 400, message: 'order does not exist' }

    const userDetails = {}
    for (const key of USER_DETAILS_FIELDS) {
        if (payload[key] !== undefined) userDetails[key] = payload[key]
    }

    const statusUpdate = payload.status && payload.status !== order.status ? { status: payload.status } : null

    const update = diff(order, userDetails)
    if (statusUpdate) Object.assign(update, statusUpdate)

    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) {
        // still check capture if status was requested but already equal?
        return order
    }

    const updated = await DL.Order.updateOne({ id }, update)

    const oldData = {}
    for (const key of Object.keys(update)) oldData[key] = order[key]

    const { record, adminActor } = utils.data.timeline
    const eventType = statusUpdate ? DL.Timeline.constants.EVENT_TYPES.ORDER_STATUS_UPDATE : DL.Timeline.constants.EVENT_TYPES.ORDER_DETAILS
    await record({
        DL,
        order,
        eventType,
        actor: adminActor(_admin),
        changes: { oldData, newData: update }
    })

    if (statusUpdate && CAPTURE_STATUSES.includes(payload.status)) {
        const fresh = await DL.Order.readById(id)
        if (fresh && !fresh.paid && fresh.payment?.cardToken) {
            await tryCapture({ DL, external, utils, _admin, order: fresh })
        }
    }

    return updated
}

update.config = {
    required: ['id'],
    permissions: ['order:update'],
    preventMultiple: (body) => `:${body?.id}`
}