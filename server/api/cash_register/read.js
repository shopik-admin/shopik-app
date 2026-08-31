export default async function read(payload, { DL }) {
    const { filter = {}, select } = payload
    return DL.CashRegister.read(filter, select, payload)
}

read.config = {
    permissions: ['cash_register:read']
}
