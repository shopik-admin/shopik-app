import { round2 } from './calcOrder/utils.js'

export function isCouponEligible(coupon, user, orderSum) {
    if (!coupon) return { eligible: false, reason: 'no coupon' }
    if (coupon.whitelist && coupon.whitelist.length > 0) {
        if (!user || !coupon.whitelist.includes(user.id)) return { eligible: false, reason: 'not in whitelist' }
    }
    if (coupon.blacklist && coupon.blacklist.length > 0) {
        if (user && coupon.blacklist.includes(user.id)) return { eligible: false, reason: 'in blacklist' }
    }
    // minSum applies regardless of dynamic flag - coupon is added but stays inactive until met
    if (orderSum < (coupon.minSum ?? 0)) return {
        eligible: false,
        isMinSumBlock: true,
        reason: 'order sum below minimum'
    }

    if (!coupon.dynamic) return { eligible: true }
    if (coupon.condition) {
        if (coupon.condition.orderRange) {
            const { start: rangeStart, end: rangeEnd } = coupon.condition.orderRange
            // user coupon version uses totalOrders, order coupon version uses orderSum
            const ordersVal = user?.totalOrders ?? orderSum
            if (ordersVal < rangeStart || (rangeEnd !== undefined && ordersVal > rangeEnd)) return { eligible: false, reason: 'order sum outside range' }
            // also check orderSum for order path if different
            if (user?.totalOrders == null && (orderSum < rangeStart || (rangeEnd !== undefined && orderSum > rangeEnd))) return { eligible: false, reason: 'order sum outside range' }
        }
        if (coupon.condition.lastOrder) {
            const { start: lastStart, end: lastEnd } = coupon.condition.lastOrder
            const userLastOrderDate = user?.lastOrderDate
            if (!userLastOrderDate) return { eligible: false, reason: 'no previous orders' }
            if (lastStart && new Date(userLastOrderDate) < new Date(lastStart)) return { eligible: false, reason: 'last order too old' }
            if (lastEnd && new Date(userLastOrderDate) > new Date(lastEnd)) return { eligible: false, reason: 'last order too recent' }
        }
        if (coupon.condition.cities && coupon.condition.cities.length > 0) {
            const activeAddress = user?.addresses?.find(a => a.active)
            if (!activeAddress || !coupon.condition.cities.includes(activeAddress.city)) return { eligible: false, reason: 'city not supported' }
        }
        if (coupon.condition.emails && coupon.condition.emails.length > 0) {
            if (!user || !coupon.condition.emails.includes(user.email)) return { eligible: false, reason: 'email not allowed' }
        }
        if (coupon.condition.phones && coupon.condition.phones.length > 0) {
            if (!user || !coupon.condition.phones.includes(user.phone)) return { eligible: false, reason: 'phone not allowed' }
        }
    }
    return { eligible: true }
}

export function calcOrderDiscount(coupon, orderSum) {
    if (!coupon) return 0
    if (coupon.benefit === 'sum') {
        return Math.min(coupon.discount, orderSum)
    }
    if (coupon.benefit === 'percent') {
        const percentDiscount = orderSum * (coupon.discount / 100)
        if (coupon.maxSum !== undefined && coupon.maxSum !== null) {
            return Math.min(percentDiscount, coupon.maxSum)
        }
        return percentDiscount
    }
    return 0
}

// Re-evaluates order.coupons entries against a new order sum:
// marks coupons ineligible (minSum/conditions no longer met) as inactive,
// recalculates applied discounts (percent rate preserved via originalDiscount)
// and clamps to the new sum.
export function resolveCoupons(orderCoupons, oldSum, newSum, user) {
    if (!orderCoupons?.length) return { coupons: [], totalDiscount: 0 }
    oldSum = Number(oldSum || 0)
    let totalDiscount = 0
    const coupons = []
    for (const c of orderCoupons) {
        const pseudoCoupon = {
            whitelist: c.whitelist,
            blacklist: c.blacklist,
            dynamic: c.minSum != null || !!c.condition,
            minSum: c.minSum,
            maxSum: c.maxSum,
            condition: c.condition,
        }
        const eligible = isCouponEligible(pseudoCoupon, user, newSum).eligible
        if (!eligible) {
            // keep coupon but mark inactive – no discount applied
            coupons.push({ ...c, isActive: false, appliedDiscount: 0 })
            continue
        }
        const storedDiscount = Number(c.discount || 0)
        // For percent coupons storedDiscount is absolute at old sum; derive rate from original coupon data if available
        let newDiscount = 0
        if (c.percent) {
            if (c.originalDiscount != null || c.benefit === 'percent') {
                const rate = c.originalDiscount != null ? Number(c.originalDiscount) / 100 : (oldSum > 0 ? storedDiscount / oldSum : 0)
                newDiscount = round2(newSum * rate)
            } else {
                const rate = oldSum > 0 ? storedDiscount / oldSum : 0
                newDiscount = rate > 0 ? round2(newSum * rate) : Math.min(storedDiscount, newSum)
            }
            if (c.maxSum != null) newDiscount = Math.min(newDiscount, Number(c.maxSum))
            newDiscount = Math.min(newDiscount, newSum)
        } else {
            newDiscount = Math.min(storedDiscount, newSum)
        }
        const updated = { ...c, isActive: true, appliedDiscount: newDiscount, discount: newDiscount }
        // Preserve original discount for future recalc if needed
        if (c.originalDiscount == null && c.percent) updated.originalDiscount = c.discount
        coupons.push(updated)
        totalDiscount += newDiscount
    }
    return { coupons, totalDiscount: round2(totalDiscount) }
}
