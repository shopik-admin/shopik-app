export default async function read(payload, { DL, _admin }) {
    const { filter = {}, select } = payload
    return DL.User.read(filter, select, payload)
}

read.config = {
    permissions: ['user:read']
}