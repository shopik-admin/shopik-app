const round2 = n => Math.round(Number(n) * 100) / 100

// Lowest regular price across all domains — a global sale must discount every domain.
function minPrice(prices) {
    if (!Array.isArray(prices)) return undefined
    let min
    for (const p of prices) {
        const v = Number(p?.price)
        if (!Number.isFinite(v)) continue
        if (min === undefined || v < min) min = v
    }
    return min
}

function resolvePriceKind(DL) {
    return DL?.Sale?.constants?.KINDS?.PRICE ?? 'price'
}

/**
 * Block sales whose sale price is not a real discount:
 * sale.price must be strictly lower than regularTotal (min domain price x amount)
 * for EVERY barcode. Throws 400 on the first offending barcode.
 * Unknown barcodes / products without any domain price are skipped (fail-open).
 */
export async function validateSalePrice({ kind, price, amount, barcodes }, { DL }) {
    const PRICE = resolvePriceKind(DL)
    if (kind !== PRICE || price == null) return
    if (!Array.isArray(barcodes) || barcodes.length === 0) return

    const qty = Number(amount) || 1
    const salePrice = round2(price)

    const products = await DL.Product.read(
        { barcode: { $in: barcodes } },
        { _id: 0, barcode: 1, prices: 1 },
        { limit: 0 }
    )
    const priceByBarcode = new Map(
        (products || []).map(p => [p.barcode, minPrice(p?.prices)])
    )

    for (const barcode of barcodes) {
        const regular = priceByBarcode.get(barcode)
        if (regular == null) continue
        const regularTotal = round2(Number(regular) * qty)
        if (salePrice >= regularTotal) {
            throw {
                status: 400,
                message: `Sale price (${salePrice}) must be lower than regular price (${regular} x ${qty} = ${regularTotal}) for barcode ${barcode}`
            }
        }
    }
}

/**
 * Sync (no-DB) version for Comax import: prices are pre-fetched into barcodeToPriceMap.
 * Returns the first offending barcode, or null when valid / not applicable.
 */
export function findInflatedBarcode({ kind, price, amount, barcodes }, barcodeToPriceMap, priceKind = 'price') {
    if (kind !== priceKind || price == null) return null
    if (!Array.isArray(barcodes) || barcodes.length === 0) return null
    if (!barcodeToPriceMap) return null

    const qty = Number(amount) || 1
    const salePrice = round2(price)

    for (const barcode of barcodes) {
        const regular = barcodeToPriceMap.get(barcode)
        if (regular == null) continue
        const regularTotal = round2(Number(regular) * qty)
        if (salePrice >= regularTotal) return barcode
    }
    return null
}
