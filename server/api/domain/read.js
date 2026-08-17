export default async function read(payload, { DL, _admin }) {
    // TODO: _admin.filter
    const { filter = {}, select } = payload
    return DL.Domain.read(filter, select, payload)
}

read.config = {
    permissions: ['domain:read']
}