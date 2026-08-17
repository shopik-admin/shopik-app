export default async function id(payload, { DL, _admin }) {
    const { id } = payload
    return DL.Product.readById(id)
}

id.config = {
    permissions: ['product:id']
}