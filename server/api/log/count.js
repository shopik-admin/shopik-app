export default async function count({ filter, search }, { DL }) {
    return DL.Log.count(filter, search)
}

count.config = {
    log: false,
    permissions: 'log:read'
}
