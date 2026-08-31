export default async function id(payload, { DL }) {
    const { id } = payload
    const cashRegister = await DL.CashRegister.readById(id)
    return cashRegister
}

id.config = {
    required: ['id'],
    permissions: ['cash_register:id']
}
