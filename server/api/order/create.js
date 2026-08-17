export default async function create(payload, { DL }) {
    payload.number = await DL.Order.getNumber()
    const created = await DL.Order.create(payload)
    return created
}

create.config = {
    permissions: ['order:create']
}
