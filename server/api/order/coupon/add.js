import diff from '#common/functions/diff.js'
import filterClientOrder from '#server/utils/data/filterClientOrder.js'
import { calcShipping, getRemainingToFreeShipping } from '#common/functions/shipping.js'
import { round2 } from '#common/functions/calcOrder/utils.js'
import { isCouponEligible, calcOrderDiscount } from '#common/functions/coupon.js'

export default async function add(payload, { DL, _user, utils }) {
    const couponCode = (payload.couponCode || '').trim().toLowerCase()
    if (!couponCode) throw { status: 400, message: 'coupon code is required' }

    const coupon = await DL.Coupon.readOne({ code: couponCode, active: true })
    if (!coupon) throw { status: 400, message: 'Coupon does not exist' }

    if (coupon.status !== 'active') throw { status: 400, message: 'Coupon is not active' }
    if (new Date() < coupon.start || new Date() > coupon.end) throw { status: 400, message: 'Coupon is expired or not yet valid' }

    let cartOrder = await utils.data.getUserOrder({ DL, _user })
    if (!cartOrder.cart) cartOrder.cart = []

    if (cartOrder.coupons?.some(c => c.code === couponCode)) throw { status: 400, message: 'Coupon already applied' }
    if (cartOrder.coupons && cartOrder.coupons.length > 0) throw { status: 400, message: 'Another coupon is already applied to this order' }

    const orderSum = cartOrder.sum || 0
    const sumNoCoupon = cartOrder.sumNoCoupon ?? orderSum

    const eligibilityResult = isCouponEligible(coupon, _user, orderSum)
    // Allow adding coupon even if minSum not yet reached – it stays on order as inactive

    if (!eligibilityResult.eligible && !eligibilityResult.isMinSumBlock) throw { status: 400, message: 'Coupon conditions not met', details: { reason: eligibilityResult.reason } }

    const isActive = eligibilityResult.eligible
    const discount = isActive ? calcOrderDiscount(coupon, orderSum) : 0
    const finalSum = Math.max(orderSum - discount, 0)

    const couponEntry = {
        code: coupon.code,
        discount: Math.round(calcOrderDiscount(coupon, orderSum) * 100) / 100,
        appliedDiscount: Math.round(discount * 100) / 100,
        percent: coupon.benefit === 'percent',
        benefit: coupon.benefit,
        originalDiscount: coupon.discount,
        minSum: coupon.minSum,
        maxSum: coupon.maxSum,
        whitelist: coupon.whitelist,
        blacklist: coupon.blacklist,
        condition: coupon.condition,
        isActive,
        couponMessages: {
            sectionMessage: { text: coupon.description || coupon.name },
            checkOutMessage: {
                icon: 'coupon',
                title: coupon.name,
                text: `${coupon.benefit === 'percent' ? coupon.discount + '%' : coupon.discount.toFixed(2)} discount — ${coupon.description || ''}`.trim()
            }
        },
        checkOnPay: false
    }

    // Shipping based on sum (pre-coupon) per spec
    const shipping = cartOrder.shipping ?? 0
    const finalShipping = shipping
    const sumWithShipping = round2(orderSum + shipping)
    const finalSumWithShipping = round2(finalSum + finalShipping)

    const updatedOrder = {
        ...cartOrder,
        coupons: [couponEntry],
        sum: orderSum,
        sumNoCoupon,
        finalSum,
        finalSumNoCoupon: sumNoCoupon,
        shipping,
        finalShipping,
        sumWithShipping,
        finalSumWithShipping,
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



add.config = {
    auth: 'required',
    required: ['couponCode']
}
