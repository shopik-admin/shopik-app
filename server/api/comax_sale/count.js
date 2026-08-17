export default async function count(payload, { DL }) {
    const { filter = {} } = payload
    return DL.ComaxSale.count(filter)
}

count.config = {
    permissions: ['comax_sale:read']
}
