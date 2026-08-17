export default async function count({ filter, search }, { DL }) {
    return DL.ComaxProduct.count(filter, search)
}

count.config = {
    permissions: 'comax_product:read'
}
