// What a replacement pair is — one rule for every screen that renders a cart
// (picking, the ops view, the order products list) and for the server that writes
// the pair, so no side can hold a half pair.

// Matches CART_PRODUCT_STATUS.ADMIN_ADD in server/dl/schemas/order.js. It lives
// here as a literal because the schema pulls mongoose into a shared module.
const ADMIN_ADD = 'admin_add'

// A line is a replaced product when the picker swapped it: the reason says so, or
// the pricing view (`replacedBy`) or the cart link points at the product that
// supplied the order. Any of the three is enough — an older order can have one
// without the others.
export function isReplacedLine(line) {
    return Boolean(line) && (
        line.missingReason === 'replaced'
        || Boolean(line.replacedBy)
        || Boolean(line.replacement?.replacementBarcode)
    )
}

// Is this product already a line in the cart? Replacement candidates are meant to
// be an alternative the order does not have yet, so every candidate list (picker
// suggestions, admin search) filters its products through this.
export function isProductInCart(product, cart = []) {
    if (!product) return false
    const barcode = String(product.barcode ?? '').trim()
    const altBarcodes = Array.isArray(product.scannableBarcodes)
        ? product.scannableBarcodes.map(b => String(b ?? '').trim())
        : []
    for (const line of cart || []) {
        if (!line) continue
        if (product.id && line.id && line.id === product.id) return true
        const lineBarcode = String(line.barcode ?? '').trim()
        if (!lineBarcode) continue
        if (lineBarcode === barcode || altBarcodes.includes(lineBarcode)) return true
    }
    return false
}

// The other half of a pair, from either side: the product that supplied the order
// when looked at from the replaced side, the product it stands for when looked at
// from the replacement side. `taken` keeps one line from being claimed by two
// originals that share a barcode.
export function findReplacement(cart, line, taken = null) {
    if (!line) return null
    const lines = cart || []
    const free = l => l && l !== line && (taken === null || !taken.has(l))

    if (isReplacedLine(line)) {
        // Looking for what supplied the order: a line that was itself not supplied
        // did not fill anything. The back-link is the reliable side of the pair;
        // `replacedBy` only names a barcode, which two lines can share.
        const supplied = l => free(l) && !l.missing
        const byLink = lines.find(l => supplied(l) && l.replacement?.originalBarcode === line.barcode)
        if (byLink) return byLink
        const fallbackBarcode = line.replacedBy || line.replacement?.replacementBarcode
        return fallbackBarcode ? lines.find(l => supplied(l) && l.barcode === fallbackBarcode) || null : null
    }

    // Looking from the replacement side: its pair is the product it stands for,
    // and that line is by definition the one that was not supplied.
    const originalBarcode = line.replacement?.originalBarcode
    return originalBarcode ? lines.find(l => free(l) && l.barcode === originalBarcode) || null : null
}

// Which side of a pair exists only because of the replacement: the line the picker
// added, never ordered by the customer. It goes away when the replacement is
// undone; a line the customer ordered keeps only its link cleared.
export function dissolvePair(cart, line) {
    const partner = findReplacement(cart, line)
    if (!partner) return { partner: null, removeLine: null }

    const addedByPicker = (a, other) => a.status === ADMIN_ADD && a.replacement?.originalBarcode === other.barcode
    const removeLine = addedByPicker(line, partner) ? line : addedByPicker(partner, line) ? partner : null

    return { partner, removeLine }
}

/**
 * The cart as a screen renders it: a replaced product and the product that supplied
 * its order are one entry, and the replacer's own line is not shown again as a
 * product the customer ordered.
 *
 * Entries keep the cart order, each pair sitting at the position of the product that
 * was ordered. A replaced original whose replacement line is gone is not a pair any
 * more — it is simply an item that was not supplied.
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
