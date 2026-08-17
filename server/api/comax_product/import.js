export default async function importComaxProducts(payload, { DL, external }) {
    const lastImportProduct = await DL.ComaxProduct.Model.findOne({}, { _id: 0, lastImportedAt: 1 })
        .sort({ lastImportedAt: -1 })
        .lean()
    const lastImportedAt = new Date()
    const comaxProducts = await external.comax.getProducts({
        lastUpdatedFromDate: lastImportProduct?.lastImportedAt ?? ''
    })

    if (comaxProducts.length === 0) {
        return { message: 'No products to import', count: 0 }
    }

    const enriched = comaxProducts.map(p => ({
        ...p,
        lastImportedAt
    }))

    const result = await DL.ComaxProduct.bulkWrite({
        docs: enriched,
        getUpsert: p => p.price > 0 && !p.archived,
        getFilter: p => ({ barcode: p.barcode }),
    })

    console.log(`[Comax Import] Inserted/updated ${result.insertedCount || enriched.length} products`)

    return {
        message: 'Import complete',
        count: enriched.length,
    }
}

importComaxProducts.config = {
    permissions: ['comax_product:update']
}
