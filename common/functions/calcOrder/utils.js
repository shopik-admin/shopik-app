export function round(num, decimals = 2) {
    if (typeof num !== 'number' || isNaN(num)) return 0
    const factor = 10 ** decimals
    const sign = num < 0 ? -1 : 1
    return Math.round((num + sign * Number.EPSILON * 5) * factor) / factor
}

export function round2(num) {
    return round(num, 2)
}

export function round3(num) {
    return round(num, 3)
}

export const SALE_KINDS = {
    PRICE: 'price',
    PERCENT: 'percent',
    AMOUNT: 'amount',
    RECEIVE_AMOUNT: 'receive-amount',
    RECEIVE_PRICE: 'receive-price'
}

export const KIND_WEIGHT = {
    [SALE_KINDS.PRICE]: 1,
    [SALE_KINDS.PERCENT]: 2,
    [SALE_KINDS.AMOUNT]: 3,
    [SALE_KINDS.RECEIVE_AMOUNT]: 4,
    [SALE_KINDS.RECEIVE_PRICE]: 5
}

export const AGORA = 0.01

export function safeGet(object, path, defaultValue) {
    return path
        .split('.')
        .reduce(
            (acc, field) => (acc && acc[field] !== undefined) ? acc[field] : defaultValue,
            object
        )
}
