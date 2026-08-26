import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

// ponytail: prominence order for progressive disclosure (desktop 4 → tablet 2 → mobile 0+sנן)
// window.date is String YYYY-MM-DD but UI is date-range (string $gte/$lte lexicographic)
// storeId resolves to store names (dynamic options fetched client-side via store/read)
export const MAIN_FIELDS = ['status', 'storeId', 'deliveryMethod', 'window.date']

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.Order, MAIN_FIELDS)
}

filters.config = {
    permissions: ['order:read']
}
