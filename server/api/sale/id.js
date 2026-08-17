export default async function id(payload, { DL, _admin }) {
    const { id } = payload
    return DL.Sale.readById(id)
}

id.config = {
    permissions: ['sale:id']
}
