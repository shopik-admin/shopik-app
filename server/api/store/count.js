export default async function count({ filter, search }, { DL }) {
    return DL.Store.count(filter, search)
}

count.config = {
    permissions: 'store:read'
}
