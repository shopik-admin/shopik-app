export default async function count(payload, { DL }) {
    const { filter = {}, search } = payload
    return DL.DisplayBlock.count(filter, search)
}

count.config = {
    permissions: ['display_block:read']
}
