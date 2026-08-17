export default async function read(payload, { DL, _admin }) {
    const { filter = {}, select } = payload
    return DL.Product.read(filter, select, payload)
}

read.config = {
    permissions: ['product:read']
}