export default async function read(payload, { DL }) {
    const { filter = {}, select } = payload
    return DL.ComaxSale.read(filter, select, payload)
}

read.config = {
    permissions: ['comax_sale:read']
}
