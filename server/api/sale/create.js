export default async function create(payload, { DL }) {
    const created = await DL.Sale.create(payload)
    return created
}

create.config = {
    permissions: ['sale:create']
}
