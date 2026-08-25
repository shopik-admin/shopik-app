export default async function count({ filter, search }, { DL }) {
    return DL.Sale.count(filter, search)
}

count.config = {
    permissions: 'sale:read'
}
