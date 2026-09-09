import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

export const MAIN_FIELDS = ['kind', 'name', 'domainId', 'placement.path', 'placement.categoryId']

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.DisplayBlock, MAIN_FIELDS)
}

filters.config = {
    permissions: ['display_block:read']
}
