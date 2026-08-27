import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

export const MAIN_FIELDS = ['status', 'kind', 'start']

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.Sale, MAIN_FIELDS)
}

filters.config = {
    permissions: ['sale:read']
}
