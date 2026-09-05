import { round2 } from './utils.js'

// Single source of truth for the shipping-derived order totals, so every
// order-mutation endpoint agrees on the field set and rounding.
// `sumNoCoupon` fields are only produced when a pre-sale sum is known,
// matching the original per-endpoint behavior.
export function shippingTotals({ sum, shipping, finalSum, sumNoCoupon, finalSumNoCoupon }) {
    const totals = {
        shipping,
        finalShipping: shipping,
        sumWithShipping: round2(sum + shipping),
        finalSumWithShipping: round2(finalSum + shipping),
    }
    if (sumNoCoupon != null) {
        totals.sumNoCouponWithShipping = round2(sumNoCoupon + shipping)
        totals.finalSumNoCouponWithShipping = round2((finalSumNoCoupon ?? sumNoCoupon) + shipping)
    }
    return totals
}
