export default async function update(payload, { DL }) {
    const { id, storeId, type, data, active } = payload

    const cashRegister = await DL.CashRegister.readById(id)
    if (!cashRegister) throw { status: 400, message: 'Cash register does not exist' }

    const update = {}
    if (active !== undefined) update.active = active
    if (type !== undefined) update.type = type
    if (data !== undefined) update.data = data

    if (storeId !== undefined && storeId !== cashRegister.storeId) {
        const store = await DL.Store.readById(storeId)
        if (!store) throw { status: 400, message: 'Store does not exist' }
        const dup = await DL.CashRegister.readOne({ storeId })
        if (dup && dup.id !== id) throw { status: 409, message: 'Cash register already exists for this store' }
        update.storeId = storeId
    }

    if (Object.keys(update).length === 0) return cashRegister

    const updated = await DL.CashRegister.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['cash_register:update']
}
