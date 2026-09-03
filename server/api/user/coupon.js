import { isCouponEligible } from '#common/functions/coupon.js'

export default async function coupon(payload, { DL, _user, utils }) {
    const order = await utils.data.getUserOrder({ DL, _user })
    const orderSum = order.sumNoCoupon || order.sum || 0

    const now = new Date()
    const coupons = await DL.Coupon.read({
        status: DL.Coupon.constants.STATUS.ACTIVE,
        start: { $lte: now },
        end: { $gte: now },
    })

    const eligibleCoupons = []

    for (const coupon of coupons) {
        const result = isCouponEligible(coupon, _user, orderSum)
        if (!result.eligible && !result.isMinSumBlock) continue

        eligibleCoupons.push({
            code: coupon.code,
            name: coupon.name,
            description: coupon.description,
            discount: coupon.discount,
            benefit: coupon.benefit,
            minSum: coupon.minSum,
            maxSum: coupon.maxSum,
            start: coupon.start,
            end: coupon.end,
        })
    }

    return { coupons: eligibleCoupons }
}

coupon.config = {
    auth: 'required'
}
