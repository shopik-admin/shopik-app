export default async function read(payload, { DL, _admin }) {
    const { filter = {}, select } = payload
    return DL.Sale.read(filter, select, payload)
}

read.config = {
    permissions: ['sale:read']
}
