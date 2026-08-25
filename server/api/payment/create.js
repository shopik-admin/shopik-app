export default async function create(payload, info) {
    const { DL, external, utils, _user } = info
    const { orderId } = payload

    if (!_user) throw { status: 401, message: 'Unauthorized' }

    const order = await DL.Order.readOne({ id: orderId })
    if (!order) throw { status: 404, message: 'Order not found' }
    if (String(order.userId) !== String(_user.id)) throw { status: 403, message: 'Not your order' }
    if (order.status !== DL.Order.constants.ORDER_STATUS.CART) throw { status: 400, message: 'Order not in cart status' }

    const amount = order.finalSumWithShippingAndHandling ?? order.finalSum ?? order.sum
    if (!amount || Number(amount) <= 0) throw { status: 400, message: 'Order amount must be > 0' }

    const hyp = external.hyp

    let paymentUrl
    try {
        paymentUrl = await hyp.createPaymentUrl({
            order,
            amount: Number(amount),
            customer: {
                name: _user.name,
                phone: _user.phone,
                email: _user.email,
                idNum: _user.idNum
            }
        })
    } catch (e) {
        throw { status: e.status || 502, message: e.message || 'Failed to create payment url' }
    }

    const terminalId = process.env.HYP_MASOF || undefined

    const txn = await DL.PaymentTransaction.create({
        domainId: order.domainId,
        storeId: order.storeId,
        orderId: order.id,
        orderNumber: order.number,
        userId: order.userId,
        provider: 'hyp',
        kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.AUTH,
        status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.PENDING,
        amount: Number(amount),
        terminalId,
        providerData: { createdAt: new Date().toISOString(), orderNumber: order.number }
    })

    try {
        await DL.Order.updateOne({ id: order.id }, { $inc: { paymentAttempts: 1 } })
    } catch { }

    try {
        const { record, userActor } = utils.data.timeline
        await record({
            DL,
            order,
            eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
            actor: userActor(_user),
            context: { step: 'payment_initiated', provider: 'hyp', amount: Number(amount), orderNumber: order.number, terminalId, providerTxnId: txn.providerTxnId || txn.id },
            outcome: { success: true },
            metadata: { source: 'payment/create', referenceOrderNumber: order.number }
        })
    } catch { }

    return { paymentUrl, transactionId: txn.id }
}

create.config = {
    required: ['orderId'],
    preventMultiple: (body) => ':' + body.orderId
}
