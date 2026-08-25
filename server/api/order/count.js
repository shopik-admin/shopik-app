export default async function count({ filter, search }, { DL }) {
    return DL.Order.count(filter, search)
}

count.config = {
    permissions: 'order:read'
}
