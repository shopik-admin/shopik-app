import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

// ponytail: prominence order for progressive disclosure (desktop 4 → tablet 2 → mobile 0+sנן)
// window.date is String YYYY-MM-DD but UI is date-range (string $gte/$lte lexicographic)
// storeId resolves to store names (dynamic options fetched client-side via store/read)
export const MAIN_FIELDS = ['status', 'storeId', 'deliveryMethod', 'window.date']

// userId stays filter:true because DL.Order.read whitelists by that flag and the client
// and bot endpoints query carts and orders by it — but an admin does not filter orders by it.
export const HIDDEN_FIELDS = ['userId']

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.Order, MAIN_FIELDS, HIDDEN_FIELDS)
}

filters.config = {
    permissions: ['order:read']
}
