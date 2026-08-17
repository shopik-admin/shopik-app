export default function read(payload, { DL }) {
    const { filter = {}, select } = payload
    return DL.Log.read(filter, select, payload)
}

read.config = {
    log: false,
    permissions: ['log:read']
}