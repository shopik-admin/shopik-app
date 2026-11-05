export async function updateSaleStatuses({ DL }) {
    const now = new Date()
    const { STATUS } = DL.Sale.constants

    // 1. Move active sales whose end date has passed -> 'done'
    const doneResultPromise = DL.Sale.update(
        { status: { $in: [STATUS.ACTIVE, STATUS.PENDING] }, end: { $lt: now } },
        { status: STATUS.DONE }
    )

    // 2. Move pending sales whose start date is now current and not expired -> 'active'
    const activeResultPromise = DL.Sale.update(
        { status: STATUS.PENDING, start: { $lte: now }, end: { $gt: now } },
        { status: STATUS.ACTIVE }
    )
    const [doneResult, activeResult] = await Promise.all([
        doneResultPromise,
        activeResultPromise
    ])
    const updatedToDone = (doneResult.modifiedCount || doneResult.nModified || 0)
    const updatedToActive = activeResult.modifiedCount || activeResult.nModified || 0

    console.log(`[Sale Sync Statuses] Done: ${updatedToDone}, Active: ${updatedToActive}`)

    return {
        updatedToDone,
        updatedToActive
    }
}

const round2 = n => Math.round(Number(n) * 100) / 100

// Lowest regular price across all domains (same rule as sale price validation).
function minPriceAcrossDomains(prices) {
    if (!Array.isArray(prices)) return undefined
    let min
    for (const p of prices) {
        const v = Number(p?.price)
        if (!Number.isFinite(v)) continue
        if (min === undefined || v < min) min = v
    }
    return min
}

// Comparable per-unit price for a sale on one barcode. Lower is better.
// Percent/receive discounts need the product's regular price; without it we
// return null and the caller falls back to the discount percent.
function saleComparablePrice(sale, regularPrice, barcode) {
    if (!sale) return null
    const kind = sale.kind
    const receive = sale.receive
    const isReceiveBarcode = Array.isArray(receive?.barcodes) && receive.barcodes.includes(barcode)

    if (kind === 'percent') {
        const percent = Number(sale.percent)
        if (Number.isFinite(percent) && regularPrice != null)
            return round2(regularPrice * Math.max(0, 1 - percent / 100))
        return null
    }

    if ((kind === 'receive-amount' || kind === 'receive-price') && isReceiveBarcode) {
        const percent = Number(receive?.percent)
        if (Number.isFinite(percent) && regularPrice != null)
            return round2(regularPrice * Math.max(0, 1 - percent / 100))
        const receivePrice = Number(receive?.price)
        if (Number.isFinite(receivePrice))
            return round2(receivePrice / (Number(receive?.amount) || 1))
        return null
    }

    // A receive-amount sale leaves its "give" barcodes at the regular price.
    if (kind === 'receive-amount') return regularPrice ?? null

    const price = Number(sale.price)
    if (Number.isFinite(price)) return round2(price / (Number(sale.amount) || 1))
    return null
}

function isBetterSale(candidate, current, regularPrice, barcode) {
    const candidateStart = new Date(candidate.start).getTime()
    const currentStart = new Date(current.start).getTime()
    if (candidateStart !== currentStart) return candidateStart > currentStart

    // Same start: the cheaper sale wins (e.g. two Comax promotions on the
    // same date for the same barcode with different totals).
    const candidatePrice = saleComparablePrice(candidate, regularPrice, barcode)
    const currentPrice = saleComparablePrice(current, regularPrice, barcode)
    if (candidatePrice != null && currentPrice != null && candidatePrice !== currentPrice)
        return candidatePrice < currentPrice
    if (candidatePrice != null && currentPrice == null) return true
    if (candidatePrice == null && currentPrice != null) return false

    const candidatePercent = Number(candidate.percent ?? candidate.receive?.percent)
    const currentPercent = Number(current.percent ?? current.receive?.percent)
    if (Number.isFinite(candidatePercent) && Number.isFinite(currentPercent) && candidatePercent !== currentPercent)
        return candidatePercent > currentPercent

    // Deterministic fallbacks so repeated syncs always produce the same winner.
    const candidateEnd = new Date(candidate.end || 0).getTime()
    const currentEnd = new Date(current.end || 0).getTime()
    if (candidateEnd !== currentEnd) return candidateEnd > currentEnd

    return String(candidate.id) > String(current.id)
}

export async function syncProductSaleIds({ DL }) {
    const { STATUS } = DL.Sale.constants

    // Get all active sales with their barcodes, dates and pricing fields.
    // A product ends up with saleIds of at most 1 element.
    const activeSales = await DL.Sale.read(
        { status: STATUS.ACTIVE },
        { _id: 0, id: 1, barcodes: 1, start: 1, end: 1, kind: 1, price: 1, amount: 1, percent: 1, receive: 1 },
        { limit: 0 }
    )

    // Group every barcode's candidate sales. The newest sale wins; when two
    // sales share the exact same start, the cheaper one wins.
    const candidatesByBarcode = new Map()

    for (const sale of activeSales) {
        if (!sale.id || !Array.isArray(sale.barcodes)) continue
        for (const barcode of sale.barcodes) {
            let candidates = candidatesByBarcode.get(barcode)
            if (!candidates) {
                candidates = []
                candidatesByBarcode.set(barcode, candidates)
            }
            candidates.push(sale)
        }
    }

    // Regular prices are only needed to compare percent/receive sales that
    // actually tie on start. Avoid loading prices for the common no-tie case.
    const tiedBarcodes = []
    for (const [barcode, candidates] of candidatesByBarcode) {
        if (candidates.length < 2) continue
        let latestStart = -Infinity
        for (const sale of candidates) {
            const start = new Date(sale.start).getTime()
            if (start > latestStart) latestStart = start
        }
        let latestCount = 0
        for (const sale of candidates) {
            if (new Date(sale.start).getTime() === latestStart) latestCount++
        }
        if (latestCount > 1) tiedBarcodes.push(barcode)
    }

    const barcodeToRegularPrice = new Map()
    if (tiedBarcodes.length > 0) {
        const products = await DL.Product.read(
            { barcode: { $in: tiedBarcodes } },
            { _id: 0, barcode: 1, prices: 1 },
            { limit: 0 }
        )
        for (const product of (products || [])) {
            if (product?.barcode)
                barcodeToRegularPrice.set(product.barcode, minPriceAcrossDomains(product.prices))
        }
    }

    const barcodeToSaleId = new Map()
    for (const [barcode, candidates] of candidatesByBarcode) {
        const regularPrice = barcodeToRegularPrice.get(barcode)
        let best = null
        for (const sale of candidates) {
            if (!best || isBetterSale(sale, best, regularPrice, barcode)) best = sale
        }
        barcodeToSaleId.set(barcode, best.id)
    }

    // Group barcodes by saleId for efficient bulk updates
    const MAX_BARCODES_PER_UPDATE = 1000
    const updatesBySaleIds = new Map()

    for (const [barcode, saleId] of barcodeToSaleId) {
        let update = updatesBySaleIds.get(saleId)
        if (!update) {
            update = { saleIds: [saleId], barcodes: [] }
            updatesBySaleIds.set(saleId, update)
        }
        update.barcodes.push(barcode)
    }

    // Chunk barcodes to avoid oversized $in arrays
    const productUpdates = []
    for (const { saleIds, barcodes } of updatesBySaleIds.values()) {
        for (let i = 0; i < barcodes.length; i += MAX_BARCODES_PER_UPDATE) {
            productUpdates.push({
                barcodes: barcodes.slice(i, i + MAX_BARCODES_PER_UPDATE),
                saleIds
            })
        }
    }

    let updatedProducts = 0

    if (productUpdates.length > 0) {
        // One `updateMany` per sale group: a single barcode list belongs to one
        // sale, and `updateOne` would only touch the first product of that list.
        const ops = productUpdates.map(p => ({
            updateMany: {
                filter: { barcode: { $in: p.barcodes } },
                update: { $set: { saleIds: p.saleIds } }
            }
        }))
        const result = await DL.Product.Model.bulkWrite(ops, { ordered: false })
        updatedProducts += result.modifiedCount || 0
    }

    // Clear stale saleIds: products with non-empty saleIds whose barcode has no active sale.
    // (Computed via distinct + $in chunks so any active-barcode volume is safe.)
    let clearedProducts = 0
    const saleBarcodes = await DL.Product.Model.distinct('barcode', { saleIds: { $exists: true, $ne: [] } })
    const staleBarcodes = saleBarcodes.filter(b => !barcodeToSaleId.has(b))
    for (let i = 0; i < staleBarcodes.length; i += MAX_BARCODES_PER_UPDATE) {
        const res = await DL.Product.update(
            { barcode: { $in: staleBarcodes.slice(i, i + MAX_BARCODES_PER_UPDATE) } },
            { saleIds: [] }
        )
        clearedProducts += res.modifiedCount || 0
    }

    console.log(`[Sale Sync Product IDs] Updated ${updatedProducts} products, cleared ${clearedProducts} stale`)
    return { updatedProducts, clearedProducts }
}

export async function updateSalesAndProducts({ DL }) {
    const statusResult = await updateSaleStatuses({ DL })
    const productResult = await syncProductSaleIds({ DL })
    return {
        ...statusResult,
        ...productResult
    }
}

export default async function syncSaleStatuses(payload, { DL }) {
    const result = await updateSalesAndProducts({ DL })

    return {
        message: 'Sale statuses synced successfully',
        ...result
    }
}

syncSaleStatuses.config = {
    permissions: ['sale:update'],
    auth: 'required',
    preventMultiple: true
}
