export default async function read(payload, { DL }) {
    const { filter = {}, select } = payload
    return DL.OrderWindowTemplate.read(filter, select, payload)
}

read.config = {
    permissions: 'order_window_template:read'
}
