export default async function read(payload, { DL, _admin }) {
    const { filter = {}, select } = payload
    return DL.Order.read(filter, select, payload)
}

read.config = {
    permissions: ['order:read']
}
