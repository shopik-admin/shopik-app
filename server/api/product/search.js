export default async function search(payload, { DL, req, _user, utils }) {
    const { value = '', filter = {}, skip = 0, limit = 50, select } = payload
    const { mode, storeId } = await utils.data.withStock.resolveStockContext(req, { DL, utils }, _user)
    const wantFilter = mode === 'filter' && !!storeId
    const wantAnnotate = mode === 'annotate' && !!storeId

    const effectiveFilter = wantFilter ? utils.data.withStock.applyStockFilter(filter, storeId, mode) : filter
    const selectForStock = wantAnnotate ? { ...(select || DL.Product.defaultSelect), storeIds: 1 } : select

    let products = await DL.Product.search(value, effectiveFilter, { skip, limit, select: selectForStock })

    if (wantAnnotate) products = utils.data.withStock.annotateInStock(products, storeId, mode)

    return products
}

search.config = {
    auth: 'none'
}
