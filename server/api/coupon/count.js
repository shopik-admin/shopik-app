export default async function count({ filter, search }, { DL }) {
    return DL.Coupon.count(filter, search)
}

count.config = {
    permissions: 'coupon:read'
}
