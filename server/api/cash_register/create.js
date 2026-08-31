export default async function create(payload, { DL }) {
    const { storeId, type = 'comax', data = {}, active = true } = payload
    if (!storeId) throw { status: 400, message: 'storeId is required' }

    const store = await DL.Store.readById(storeId)
    if (!store) throw { status: 400, message: 'Store does not exist' }

    const existing = await DL.CashRegister.readOne({ storeId })
    if (existing) throw { status: 409, message: 'Cash register already exists for this store' }

    const doc = { storeId, type, data, active }
    const created = await DL.CashRegister.create(doc)
    return created
}

create.config = {
    required: ['storeId'],
    permissions: ['cash_register:create']
}
