import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

export const MAIN_FIELDS = ['status', 'department', 'benefit', 'start']

export default async function filters(payload, { DL }) {
    return buildFilterDescriptors(DL.Coupon, MAIN_FIELDS)
}

filters.config = {
    permissions: ['coupon:read']
}
