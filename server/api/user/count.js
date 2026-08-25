export default async function count({ filter, search }, { DL }) {
    return DL.User.count(filter, search)
}

count.config = {
    permissions: 'user:read'
}
