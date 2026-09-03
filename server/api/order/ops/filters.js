import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

export const MAIN_FIELDS = ['status', 'storeId', 'deliveryMethod', 'window.date']

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.Order, MAIN_FIELDS)
}

filters.config = {
    permissions: ['order:read', 'order:pick', 'order:ship']
}
