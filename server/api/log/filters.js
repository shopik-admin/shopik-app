import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

export const MAIN_FIELDS = ['status', 'action', 'actor.type', 'ip']

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.Log, MAIN_FIELDS)
}

filters.config = {
    permissions: ['log:read']
}
