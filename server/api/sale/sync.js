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

export async function syncProductSaleIds({ DL }) {
    const { STATUS } = DL.Sale.constants

    // Get all active sales with their barcodes and ids, most recent start first
    // so the newest sale wins when a barcode appears in several sales.
    // A product ends up with saleIds of at most 1 element: [newestSaleId].
    const activeSales = await DL.Sale.read(
        { status: STATUS.ACTIVE },
        { _id: 0, id: 1, barcodes: 1, start: 1 },
        { limit: 0 }
    )

    activeSales.sort((a, b) => new Date(b.start) - new Date(a.start))

    // Build barcode -> single saleId map (first = most recent wins,
    // later/older sales for the same barcode are ignored)
    const barcodeToSaleId = new Map()

    for (const sale of activeSales) {
        if (!sale.id || !sale.barcodes) continue
        for (const barcode of sale.barcodes) {
            if (!barcodeToSaleId.has(barcode)) {
                barcodeToSaleId.set(barcode, sale.id)
            }
        }
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
        const result = await DL.Product.bulkWrite({
            docs: productUpdates,
            getFilter: p => ({ barcode: { $in: p.barcodes } }),
            getUpsert: () => false,
            getUpdate: p => ({ $set: { saleIds: p.saleIds } })
        })
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
