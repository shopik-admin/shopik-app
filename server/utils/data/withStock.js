async function getStockMode(DL) {
    const setting = await DL.Setting.readOne({ key: 'stock.mode' }, { _id: 0, value: 1 }).catch(() => null)
    const raw = setting?.value ?? process.env.STOCK_MODE ?? 'off'
    const mode = String(raw).toLowerCase()
    return ['filter', 'annotate', 'off'].includes(mode) ? mode : 'off'
}

export async function resolveStockContext(req, bootData, injectedUser) {
    const mode = await getStockMode(bootData.DL)
    if (mode === 'off') return { mode: 'off', storeId: null }
    const anyRegister = await bootData.DL.CashRegister.readOne({ active: true }).catch(() => null)
    if (!anyRegister) return { mode: 'off', storeId: null }
    const storeId = await bootData.utils.data.getUserStore(req, bootData, injectedUser)
    return { mode, storeId }
}

export function applyStockFilter(filter, storeId, mode) {
    if (!storeId || mode !== 'filter') return filter
    return { ...filter, storeIds: storeId }
}

export function annotateInStock(products, storeId, mode) {
    if (mode !== 'annotate' || !storeId) return products
    return products.map(p => ({ ...p, inStock: Array.isArray(p.storeIds) ? p.storeIds.includes(storeId) : true }))
}
