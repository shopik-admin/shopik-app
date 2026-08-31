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

export default async function syncStockForStores({ storeId: onlyStoreId } = {}, { DL, external }) {
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
        const params = {
            storeId: comaxStoreId,
            loginId: process.env.COMAX_LOGIN_ID,
            loginPassword: process.env.COMAX_LOGIN_PASSWORD,
            priceListId: process.env.COMAX_PRICELIST_ID,
        }
        const log = DL.Log.start({
            action: 'comax_sync_stock',
            direction: DL.Log.constants.DIRECTION.OUT,
            data: { request: { storeId: reg.storeId, comaxStoreId, params: { StoreID: params.storeId, PriceListID: params.priceListId } } }
        })
        log.actor({ type: DL.Log.constants.ACTOR.API })
        try {
            const balances = await external.comax.getBalance(params)
            const inStockBarcodes = new Set(balances.filter(b => !b.error && b.balance > 0).map(b => b.barcode))
            const outOfStockBarcodes = new Set(balances.filter(b => !b.error && b.balance <= 0).map(b => b.barcode))

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
