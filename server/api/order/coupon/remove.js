import diff from '#common/functions/diff.js'
import filterClientOrder from '#server/utils/data/filterClientOrder.js'

export default async function remove(payload, { DL, _user, utils }) {
    const couponCode = (payload.couponCode || '').trim().toLowerCase()
    if (!couponCode) throw { status: 400, message: 'coupon code is required' }

    let cartOrder = await utils.data.getUserOrder({ DL, _user })
    if (!cartOrder.cart) cartOrder.cart = []

    const originalCoupon = cartOrder.coupons?.find(c => c.code === couponCode)
    if (!originalCoupon) throw { status: 400, message: 'Coupon not found on this order' }

    const orderSum = cartOrder.sum || 0
    const sumNoCoupon = cartOrder.sumNoCoupon ?? orderSum

    const updatedOrder = {
        ...cartOrder,
        coupons: [],
        sum: orderSum,
        sumNoCoupon,
        finalSum: orderSum,
        finalSumNoCoupon: sumNoCoupon,
        customerUpdatedAt: new Date()
    }

    const updateData = diff(cartOrder, updatedOrder)
    let finalOrder = cartOrder

    if (Object.keys(updateData).length > 0) {
        const savedOrder = await DL.Order.updateOne(
            { id: cartOrder.id },
            { $set: updateData }
        )
        if (savedOrder) finalOrder = savedOrder

        const oldData = {}
        for (const key of Object.keys(updateData)) oldData[key] = cartOrder[key]

        const { record, userActor } = utils.data.timeline
        await record({
            DL,
            order: cartOrder,
            eventType: DL.Timeline.constants.EVENT_TYPES.ORDER_COUPON,
            actor: userActor(_user),
            changes: { oldData, newData: updateData }
        })
    }

    return filterClientOrder(finalOrder)
}

remove.config = {
    auth: 'required',
    required: ['couponCode']
}
