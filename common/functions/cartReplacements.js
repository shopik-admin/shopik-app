// What a replacement pair is — one rule for every screen that renders a cart
// (picking, the ops view, the order products list) and for the invoice note, so
// they can never disagree about the same cart.

// A line is a replaced original when the picker swapped it: the reason says so,
// or the pricing view (`replacedBy`) or the cart link points at the product that
// supplied the order. Any of the three is enough — an older order can have one
// without the others.
export function isReplacedLine(line) {
    return Boolean(line) && (
        line.missingReason === 'replaced'
        || Boolean(line.replacedBy)
        || Boolean(line.replacement?.replacementBarcode)
    )
}

// The line that supplied a replaced product's order. The replacer's own back-link
// is the reliable side of the pair, so it is looked at first; `taken` keeps a line
// from being claimed by two originals that share a barcode.
export function findReplacement(cart, line, taken = null) {
    const barcode = line?.barcode
    const free = l => l && !l.missing && (taken === null || !taken.has(l))

    const byLink = (cart || []).find(l => free(l) && l.replacement?.originalBarcode && l.replacement.originalBarcode === barcode)
    if (byLink) return byLink

    const fallbackBarcode = line?.replacedBy || line?.replacement?.replacementBarcode
    if (!fallbackBarcode) return null
    return (cart || []).find(l => free(l) && l.barcode === fallbackBarcode) || null
}

/**
 * The cart as a screen renders it: a replaced product and the product that
 * supplied its order are one entry, and the replacer's own line is not shown
 * again as a product the customer ordered.
 *
 * Entries keep the cart order, each pair sitting at the position of the product
 * that was ordered. A replaced original whose replacement line is gone is not a
 * pair any more — it is simply an item that was not supplied.
 *
 * @returns {Array<{ type: 'pair', original: object, replacer: object, key: string }
 *              | { type: 'product', product: object, key: string }>}
 */
export function groupCart(cart = []) {
    const pairs = new Map()
    const taken = new Set()

    for (const line of cart) {
        if (!line?.missing || !isReplacedLine(line)) continue
        const replacer = findReplacement(cart, line, taken)
        if (!replacer) continue
        pairs.set(line, replacer)
        taken.add(replacer)
    }

    const name = line => line.id || line.barcode

    return cart.filter(Boolean).map(line => {
        if (pairs.has(line)) {
            const replacer = pairs.get(line)
            return { type: 'pair', original: line, replacer, key: `${name(line)}->${name(replacer)}` }
        }
        if (taken.has(line)) return null
        return { type: 'product', product: line, key: name(line) }
    }).filter(Boolean)
}
