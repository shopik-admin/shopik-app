import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

export const MAIN_FIELDS = ['phone', 'email', 'name.first', 'name.last']

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.Admin, MAIN_FIELDS)
}

filters.config = {
    permissions: ['admin:read']
}
