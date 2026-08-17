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

    // Get all active sales with their barcodes and ids
    const activeSales = await DL.Sale.read(
        { status: STATUS.ACTIVE },
        { _id: 0, id: 1, barcodes: 1 },
        { limit: 0 }
    )

    if (activeSales.length === 0) return { updatedProducts: 0 }

    // Build barcode -> saleIds map
    const barcodeToSaleIds = new Map()

    for (const sale of activeSales) {
        if (!sale.id || !sale.barcodes) continue
        for (const barcode of sale.barcodes) {
            const existing = barcodeToSaleIds.get(barcode) || []
            if (!existing.includes(sale.id)) {
                existing.push(sale.id)
                barcodeToSaleIds.set(barcode, existing)
            }
        }
    }

    // Group barcodes by identical saleIds combination for efficient bulk updates
    const MAX_BARCODES_PER_UPDATE = 1000
    const updatesBySaleIds = new Map()

    for (const [barcode, saleIds] of barcodeToSaleIds) {
        const sortedSaleIds = [...saleIds].sort()
        const key = JSON.stringify(sortedSaleIds)

        let update = updatesBySaleIds.get(key)
        if (!update) {
            update = { saleIds: sortedSaleIds, barcodes: [] }
            updatesBySaleIds.set(key, update)
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

    console.log(`[Sale Sync Product IDs] Updated ${updatedProducts} products`)
    return { updatedProducts }
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
