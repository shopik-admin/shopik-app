export default async function id({ id }, { DL, _admin }) {
    const comaxProduct = await DL.ComaxProduct.readById(id)
    return comaxProduct
}

id.config = {
    required: ['id'],
    permissions: ['comax_product:id']
}
