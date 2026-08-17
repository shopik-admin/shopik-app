export default async function read(payload, { DL, _admin }) {
    const { filter = {}, select } = payload
    return DL.Store.read(filter, select, payload)
}

read.config = {
    permissions: ['store:read']
}
