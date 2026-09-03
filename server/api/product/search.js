export default async function search(payload, { DL, req, _user, utils }) {
    const { value = '', filter = {}, skip = 0, limit = 50, select } = payload
    const { mode, storeId } = await utils.data.withStock.resolveStockContext(req, { DL, utils }, _user)
    const wantFilter = mode === 'filter' && !!storeId
    const wantAnnotate = mode === 'annotate' && !!storeId

    const effectiveFilter = wantFilter ? utils.data.withStock.applyStockFilter(filter, storeId, mode) : filter
    const selectForStock = wantAnnotate ? { ...(select || DL.Product.defaultSelect), storeIds: 1 } : select

    // Barcode exact fast-path: numeric-only search bypasses Atlas entirely (barcode is no longer indexed)
    const trimmed = (value || '').trim()
    if (/^\d+$/.test(trimmed)) {
        const exactFilter = { ...effectiveFilter, barcode: trimmed }
        let products = await DL.Product.read(exactFilter, selectForStock, { limit, skip })
        if (wantAnnotate) products = utils.data.withStock.annotateInStock(products, storeId, mode)
        const sales = await collectSales(products)
        return { products, sales }
    }

    let products = await DL.Product.search(value, effectiveFilter, { skip, limit, select: selectForStock })

    if (wantAnnotate) products = utils.data.withStock.annotateInStock(products, storeId, mode)

    const sales = await collectSales(products)
    return { products, sales }

    async function collectSales(prods) {
        const saleIdSet = new Set()
        for (const p of prods || []) {
            if (p?.saleIds && Array.isArray(p.saleIds)) {
                for (const sid of p.saleIds) saleIdSet.add(sid)
            }
        }
        if (!saleIdSet.size) return {}
        const activeSales = await DL.Sale.read(
            { id: { $in: Array.from(saleIdSet) }, status: DL.Sale.constants.STATUS.ACTIVE },
            DL.Sale.defaultSelect,
            { limit: 0 }
        )
        const map = {}
        for (const s of activeSales) map[s.id] = s
        return map
    }
}

search.config = {
    auth: 'none'
}
