import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

export const MAIN_FIELDS = ['status', 'category.title', 'producer', 'label']

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.Product, MAIN_FIELDS)
}

filters.config = {
    permissions: ['product:read']
}
