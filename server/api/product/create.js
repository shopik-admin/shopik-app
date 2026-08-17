export default async function create(payload, { DL }) {
    const created = await DL.Product.create(payload)
    return created
}

create.config = {
    permissions: ['product:create']
}