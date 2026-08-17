export default async function count({ filter, search }, { DL }) {
    return DL.Product.count(filter, search)
}

count.config = {
    permissions: 'product:read'
}
