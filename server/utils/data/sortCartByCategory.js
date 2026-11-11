/**
 * The cart of an ops order renders grouped by category: L1 first, then L2, then
 * L3. A site category id is its own path (`nc:<L1>:<L2>[:<L3>]`), so ordering by
 * it already keeps every group adjacent. Products without a category go last,
 * and lines in the same category keep the cart order they arrived in.
 *
 * The ops screens swap the whole order into state after each pick action, so
 * every endpoint that returns an order has to sort — otherwise the cart would
 * jump back to its stored order between actions.
 */
export default function sortCartByCategory(cart = []) {
    const key = item => item?.category?.id || ''
    return [...(cart || [])].sort((a, b) => {
        const ka = key(a), kb = key(b)
        if (!ka !== !kb) return ka ? -1 : 1
        return ka < kb ? -1 : ka > kb ? 1 : 0
    })
}

// Returns a copy with its cart sorted; an order without a cart is untouched.
export function withSortedCart(order) {
    if (!Array.isArray(order?.cart)) return order
    return { ...order, cart: sortCartByCategory(order.cart) }
}
