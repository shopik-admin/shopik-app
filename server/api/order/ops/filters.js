import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

export const MAIN_FIELDS = ['status', 'deliveryMethod', 'window.date']
// NOTE: no storeId here — the ops queue is always scoped to currentStoreId
// server-side (see opsFilter.js), so a store pill would have no effect.

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.Order, MAIN_FIELDS).filter(d => d.key !== 'storeId')
}

filters.config = {
    permissions: ['order:read', 'order:pick', 'order:ship']
}
