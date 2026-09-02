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
        if (!result.eligible) continue

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

function isCouponEligible(coupon, user, orderSum) {
    if (coupon.whitelist && coupon.whitelist.length > 0) {
        if (!coupon.whitelist.includes(user.id)) return { eligible: false }
    }

    if (coupon.blacklist && coupon.blacklist.length > 0) {
        if (coupon.blacklist.includes(user.id)) return { eligible: false }
    }

    if (!coupon.dynamic) return { eligible: true }

    if (orderSum < coupon.minSum) return { eligible: false }

    if (coupon.condition) {
        if (coupon.condition.orderRange) {
            const { start: rangeStart, end: rangeEnd } = coupon.condition.orderRange
            const { totalOrders = 0 } = user
            if (totalOrders < rangeStart || (rangeEnd !== undefined && totalOrders > rangeEnd)) return { eligible: false }
        }

        if (coupon.condition.lastOrder) {
            const { start: lastStart, end: lastEnd } = coupon.condition.lastOrder
            const userLastOrderDate = user.lastOrderDate
            if (!userLastOrderDate) return { eligible: false }
            if (lastStart && new Date(userLastOrderDate) < new Date(lastStart)) return { eligible: false }
            if (lastEnd && new Date(userLastOrderDate) > new Date(lastEnd)) return { eligible: false }
        }

        if (coupon.condition.cities && coupon.condition.cities.length > 0) {
            const activeAddress = user.addresses?.find(a => a.active)
            if (!activeAddress || !coupon.condition.cities.includes(activeAddress.city)) return { eligible: false }
        }

        if (coupon.condition.emails && coupon.condition.emails.length > 0) {
            if (!coupon.condition.emails.includes(user.email)) return { eligible: false }
        }

        if (coupon.condition.phones && coupon.condition.phones.length > 0) {
            if (!coupon.condition.phones.includes(user.phone)) return { eligible: false }
        }
    }

    return { eligible: true }
}

coupon.config = {
    auth: 'required'
}
