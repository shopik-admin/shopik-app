async function applyStoreIdsDelta({ storeId, inStockBarcodes, outOfStockBarcodes, DL }) {
    const chunk = (arr, n) => arr.length > n ? Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n)) : [arr]
    const CHUNK = 5000

    let updated = 0

    if (inStockBarcodes.size) {
        for (const part of chunk([...inStockBarcodes], CHUNK)) {
            const res = await DL.Product.Model.updateMany(
                { barcode: { $in: part } },
                { $addToSet: { storeIds: storeId } }
            )
            updated += res.modifiedCount || 0
        }
    }
    if (outOfStockBarcodes.size) {
        for (const part of chunk([...outOfStockBarcodes], CHUNK)) {
            const res = await DL.Product.Model.updateMany(
                { barcode: { $in: part } },
                { $pull: { storeIds: storeId } }
            )
            updated += res.modifiedCount || 0
        }
    }
    return { inStock: inStockBarcodes.size, outOfStock: outOfStockBarcodes.size, updated }
}

/**
 * Read the in-stock barcodes the import recorded for one store.
 * Paged: a store holds thousands of items and the doc is never loaded whole.
 */
async function readInStockBarcodes(DL, storeId) {
    const BATCH = Number(process.env.COMAX_SYNC_BATCH || 1000)
    const barcodes = new Set()
    for (let skip = 0; ; skip += BATCH) {
        const rows = await DL.ComaxProduct.read(
            { storeIds: storeId, barcode: { $nin: [null, ''] } },
            { _id: 0, barcode: 1 },
            { limit: BATCH, skip, sort: { barcode: 1 } }
        )
        if (!rows?.length) break
        for (const row of rows) if (row.barcode) barcodes.add(row.barcode)
        if (rows.length < BATCH) break
    }
    return barcodes
}

/**
 * Copy the per-store stock state the import wrote on comax_products
 * (`storeIds`) onto products.storeIds, which is what the storefront filters on.
 *
 * The import is the source of truth: a store's feed is a complete snapshot, so
 * "not in comax_products.storeIds" means out of stock for that store.
 */
export default async function syncStockForStores({ storeId: onlyStoreId } = {}, { DL }) {
    const filter = { active: true, type: 'comax' }
    if (onlyStoreId) filter.storeId = onlyStoreId

    const registers = await DL.CashRegister.read(filter, { _id: 0 }, { limit: 0 })
    if (!registers || registers.length === 0) return { syncedStores: 0, updated: 0, details: [] }

    const details = []
    for (const reg of registers) {
        const comaxStoreId = (reg.data?.StockStoreID || '').trim() || process.env.COMAX_STORE_ID || ''
        if (!comaxStoreId) {
            const msg = 'missing StockStoreID — set cash_register.data.StockStoreID or COMAX_STORE_ID env'
            const logSkip = DL.Log.start({ action: 'comax_sync_stock', direction: DL.Log.constants.DIRECTION.OUT, data: { request: { storeId: reg.storeId } } })
            logSkip.actor({ type: DL.Log.constants.ACTOR.API })
            await logSkip.error({ storeId: reg.storeId, message: msg }).catch(() => {})
            details.push({ storeId: reg.storeId, error: msg })
            continue
        }
        const log = DL.Log.start({
            action: 'comax_sync_stock',
            direction: DL.Log.constants.DIRECTION.OUT,
            data: { request: { storeId: reg.storeId, comaxStoreId } }
        })
        log.actor({ type: DL.Log.constants.ACTOR.API })
        try {
            const inStockBarcodes = await readInStockBarcodes(DL, reg.storeId)
            if (inStockBarcodes.size === 0) {
                // An empty set is far more likely a broken/empty import than a
                // store that sells nothing. Pulling every storeId would empty
                // the whole storefront, so skip instead.
                const msg = 'no in-stock items in comax_products — skipping this store'
                await log.error({ storeId: reg.storeId, message: msg }).catch(() => {})
                details.push({ storeId: reg.storeId, error: msg })
                continue
            }

            const current = await DL.Product.Model.distinct('barcode', { storeIds: reg.storeId })
            const outOfStockBarcodes = new Set(
                (current || []).filter(barcode => barcode && !inStockBarcodes.has(barcode))
            )

            const result = await applyStoreIdsDelta({ storeId: reg.storeId, inStockBarcodes, outOfStockBarcodes, DL })
            await log.success({ storeId: reg.storeId, ...result })
            details.push({ storeId: reg.storeId, ...result })
        } catch (e) {
            await log.error({ storeId: reg.storeId, message: e?.message || String(e), stack: e?.stack }).catch(() => {})
            details.push({ storeId: reg.storeId, error: e?.message || String(e) })
        }
    }

    const updated = details.reduce((sum, d) => sum + (d.updated || 0), 0)
    return { syncedStores: details.length, updated, details }
}

syncStockForStores.config = {
    permissions: ['cash_register:sync']
}
