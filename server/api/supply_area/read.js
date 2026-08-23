export default async function read(payload, { DL }) {
    const { filter = {}, select } = payload
    return DL.SupplyArea.read(filter, select, payload)
}

read.config = {
    permissions: ['supply_area:read']
}