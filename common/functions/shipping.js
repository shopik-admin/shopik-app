import { round2 } from './calcOrder/utils.js'

export function calcShipping({ sum = 0, deliveryMethod = 'delivery', shippingConfig } = {}) {
    if (!shippingConfig) return 0
    if (!sum || Number(sum) <= 0) return 0
    const total = Number(shippingConfig.total ?? 0)
    const freeFrom = Number(shippingConfig.freeFrom ?? Infinity)
    const pickupTotal = Number(shippingConfig.pickupTotal ?? total)
    const pickupFreeFrom = Number(shippingConfig.pickupFreeFrom ?? freeFrom)

    const isPickup = deliveryMethod === 'pickup'
    const threshold = isPickup ? pickupFreeFrom : freeFrom
    const fee = isPickup ? pickupTotal : total

    if (sum >= threshold) return 0
    return round2(fee)
}

export function calcShippingDetailed({ sum = 0, deliveryMethod = 'delivery', shippingConfig } = {}) {
    const fee = calcShipping({ sum, deliveryMethod, shippingConfig })
    const isPickup = deliveryMethod === 'pickup'
    const threshold = isPickup
        ? Number(shippingConfig?.pickupFreeFrom ?? shippingConfig?.freeFrom ?? Infinity)
        : Number(shippingConfig?.freeFrom ?? Infinity)
    const originalFee = isPickup
        ? Number(shippingConfig?.pickupTotal ?? shippingConfig?.total ?? 0)
        : Number(shippingConfig?.total ?? 0)
    const remaining = Math.max(0, Math.round(threshold - Number(sum || 0)))
    const isFree = fee === 0 && originalFee > 0 && sum > 0
    return { fee: round2(fee), originalFee: round2(originalFee), threshold, remaining, isFree, isPickup }
}

export function getRemainingToFreeShipping({ sum = 0, deliveryMethod = 'delivery', shippingConfig } = {}) {
    if (!shippingConfig) return 0
    const threshold = deliveryMethod === 'pickup'
        ? Number(shippingConfig.pickupFreeFrom ?? shippingConfig.freeFrom ?? Infinity)
        : Number(shippingConfig.freeFrom ?? Infinity)
    return Math.max(0, Math.round(threshold - Number(sum || 0)))
}

export function extractShippingConfig(settings) {
    if (!settings || typeof settings !== 'object') return null
    if (settings.shipping && typeof settings.shipping === 'object' && ('total' in settings.shipping || 'freeFrom' in settings.shipping)) return settings.shipping
    for (const cat of Object.values(settings)) {
        if (cat && typeof cat === 'object' && cat.shipping && typeof cat.shipping === 'object') return cat.shipping
    }
    return null
}

export default calcShipping
