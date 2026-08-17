export default async function search(payload, { DL }) {
    const { value = '', filter, skip = 0, limit = 50, select } = payload

    return DL.Product.search(value, filter, { skip, limit, select })
}

search.config = {
    auth: 'none'
}