import resolveBotUser from '#server/utils/auth/resolveBotUser.js'
import { isCouponEligible, calcOrderDiscount } from '#common/functions/coupon.js'

/**
 * POST /api/bot/coupon_validate
 * Auth: API key with `bot:coupon` permission (router enforces).
 * Body: { code, userToken?, phone? }
 * - User must be identified first (personal coupons depend on
 *   whitelist / condition.phones) — pass the userToken from
 *   bot/otp_verify, or a phone fallback.
 * - The cart sum is read server-side from the user's active cart
 *   order (plain read, never creates a cart).
 * - Read-only: never applies the coupon, only explains validity.
 * Returns: { valid, reason, discount, minSum, maxSum, isMinSumBlock }
 */
export default async function coupon_validate(payload, info) {
    const { DL, utils } = info
    const { code, userToken, phone, domainId } = payload || {}
    if (!code) throw { status: 400, message: 'code required' }

    const user = await resolveBotUser({ DL, utils, domainId, userToken, phone })

    const couponCode = String(code).trim().toLowerCase()
    const coupon = await DL.Coupon.readOne({ code: couponCode })
    if (!coupon) return { valid: false, reason: 'Coupon does not exist' }
    if (coupon.status !== 'active') return { valid: false, reason: 'Coupon is not active' }
    const now = new Date()
    if ((coupon.start && now < new Date(coupon.start)) || (coupon.end && now > new Date(coupon.end)))
        return { valid: false, reason: 'Coupon is expired or not yet valid' }

    // Live cart sum (pre-coupon total, same basis as minSum enforcement).
    // Plain read — never creates a cart order as a side effect.
    let sum = 0
    try {
        const cartOrder = await DL.Order.readOne(
            { userId: user.id, status: 'cart', active: true },
            { _id: 0, sum: 1, sumNoCoupon: 1 }
        )
        sum = Number(cartOrder?.sumNoCoupon ?? cartOrder?.sum ?? 0) || 0
    } catch { sum = 0 }
    const result = isCouponEligible(coupon, user, sum)
    if (!result.eligible)
        return {
            valid: false,
            reason: result.reason,
            minSum: coupon.minSum ?? 0,
            maxSum: coupon.maxSum ?? null,
            isMinSumBlock: !!result.isMinSumBlock
        }

    return {
        valid: true,
        reason: null,
        discount: calcOrderDiscount(coupon, sum),
        benefit: coupon.benefit,
        minSum: coupon.minSum ?? 0,
        maxSum: coupon.maxSum ?? null,
        isMinSumBlock: false
    }
}

coupon_validate.config = {
    auth: 'none',
    permissions: ['bot:coupon'],
    required: ['code']
}
