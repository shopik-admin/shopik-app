export default async function current_store(payload, { DL, _admin }) {
    const { storeId } = payload
    if (!storeId) throw { status: 400, message: 'storeId required' }

    const admin = await DL.Admin.readById(_admin.id)
    const isSuper = _admin.isSuperAdmin

    if (!isSuper) {
        if (!admin?.storeIds?.includes(storeId))
            throw { status: 403, message: 'store not allowed' }
    } else {
        const store = await DL.Store.readById(storeId)
        if (!store) throw { status: 400, message: 'store not found' }
    }

    await DL.Admin.updateOne({ id: _admin.id }, { currentStoreId: storeId })
    if (DL.redis) await DL.redis.del(`admin_auth:${_admin.id}`).catch(() => {})
    const updated = await DL.Admin.readById(_admin.id)
    return { currentStoreId: updated.currentStoreId }
}

current_store.config = {
    permissions: ['order:pick', 'order:ship', 'order:read']
}
