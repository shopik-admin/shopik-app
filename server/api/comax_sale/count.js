export default async function count({ filter, search }, { DL }) {
    return DL.ComaxSale.count(filter, search)
}

count.config = {
    permissions: ['comax_sale:read']
}
