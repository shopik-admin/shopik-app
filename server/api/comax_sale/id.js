export default async function id(payload, { DL }) {
    const { id: comaxSaleId } = payload
    return DL.ComaxSale.readOne({ id: comaxSaleId })
}

id.config = {
    permissions: ['comax_sale:id']
}
