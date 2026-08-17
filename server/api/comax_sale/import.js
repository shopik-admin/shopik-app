export default async function importComaxSales(payload, { DL, external }) {
    const lastImportSale = await DL.ComaxSale.Model.findOne({}, { _id: 0, lastImportedAt: 1 })
        .sort({ lastImportedAt: -1 })
        .lean()
    const lastImportedAt = new Date()

    const comaxSales = await external.comax.getPromotions({
        lastUpdatedDate: lastImportSale?.lastImportedAt ?? '',
        justActive: payload.justActive ?? true,
        futurePromotions: payload.futurePromotions ?? true
    })

    if (comaxSales.length === 0) {
        return { message: 'No sales to import', count: 0 }
    }

    const enriched = comaxSales.map(s => ({
        ...s,
        lastImportedAt
    }))

    const result = await DL.ComaxSale.bulkWrite({
        docs: enriched,
        getUpsert: () => true,
        getFilter: s => ({ comaxId: s.comaxId })
    })

    console.log(`[Comax Sales Import] Inserted/updated ${result.insertedCount || result.modifiedCount || enriched.length} sales`)

    return {
        message: 'Import complete',
        count: enriched.length
    }
}

importComaxSales.config = {
    permissions: ['comax_sale:update']
}
