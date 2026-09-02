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

// For client calcOrder where coupon entry is stored as {discount, percent, minSum, maxSum, code}
// Need to recalc discount based on new sum, respecting original benefit and caps
export function calcCouponDiscountForOrder(couponEntry, orderSum, user) {
    // couponEntry may be normalized from order.coupons (has discount, percent, minSum, maxSum)
    // Reconstruct a coupon-like object for eligibility check
    const pseudoCoupon = {
        whitelist: couponEntry.whitelist,
        blacklist: couponEntry.blacklist,
        dynamic: true, // assume dynamic if minSum present
        minSum: couponEntry.minSum,
        maxSum: couponEntry.maxSum,
        condition: couponEntry.condition,
        benefit: couponEntry.percent ? 'percent' : 'sum',
        discount: couponEntry.percent ? undefined : couponEntry.discount, // for percent we need rate
    }
    // For percent, discount rate is stored as absolute at time of apply; derive rate from stored vs old sum?
    // Better to store original percent discount value in couponEntry - but we only have absolute.
    // Caller should handle rate derivation; this helper just uses calcOrderDiscount if benefit known
    // If percent, we need original percent rate; fallback to using stored discount as absolute is wrong for new sum.
    // So this function is not used directly for percent recalc - see cart.js rate logic.
    return calcOrderDiscount(pseudoCoupon, orderSum)
}

export function isCouponEntryEligible(couponEntry, orderSum, user) {
    // couponEntry from order.coupons has minSum, etc.
    if (couponEntry.minSum != null && orderSum < Number(couponEntry.minSum)) return false
    // For full eligibility, delegate to isCouponEligible with pseudo coupon
    const pseudo = {
        whitelist: couponEntry.whitelist,
        blacklist: couponEntry.blacklist,
        dynamic: couponEntry.minSum != null || !!couponEntry.condition,
        minSum: couponEntry.minSum,
        maxSum: couponEntry.maxSum,
        condition: couponEntry.condition,
    }
    // if no dynamic fields, just minSum check is enough
    if (!pseudo.dynamic) return true
    const res = isCouponEligible(pseudo, user, orderSum)
    return res.eligible
}
