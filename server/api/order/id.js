export default async function id({ id }, { DL, _admin }) {
    const order = await DL.Order.readById(id)
    return order
}

id.config = {
    required: ['id'],
    permissions: ['order:id']
}
