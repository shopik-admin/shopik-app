export default async function count({ filter, search }, { DL }) {
    return DL.Domain.count(filter, search)
}

count.config = {
    permissions: 'domain:read'
}
