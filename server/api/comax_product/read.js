export default async function read(payload, { DL, _admin }) {
    const { filter = {}, select } = payload
    return DL.ComaxProduct.read(filter, select, payload)
}

read.config = {
    permissions: ['comax_product:read']
}
