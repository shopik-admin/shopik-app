import { buildCategoryProducts } from '#server/reports/catalog.js'

export default async function products(payload, { DL }) {
    return buildCategoryProducts({
        DL,
        scope: payload || {},
        limit: payload?.limit,
        offset: payload?.offset,
        search: payload?.search,
        storeIds: payload?.storeIds,
        minSales: payload?.minSales,
        maxSales: payload?.maxSales,
        minSalePrice: payload?.minSalePrice,
        maxSalePrice: payload?.maxSalePrice,
        minBuyingPrice: payload?.minBuyingPrice,
        maxBuyingPrice: payload?.maxBuyingPrice,
        siteStatuses: payload?.siteStatuses,
        hasImage: payload?.hasImage,
        inGs1: payload?.inGs1,
        kashrutValid: payload?.kashrutValid,
        sort: payload?.sort,
        dir: payload?.dir
    })
}

products.config = {
    permissions: ['comax_product:read']
}
