export default async function current_store({ storeId }, { DL, _admin }) {
    if (!storeId) throw { status: 400, message: 'storeId required' }

    // storeIds rides the cached auth payload (getAdmin), invalidated on every switch
    if (_admin.isSuperAdmin) {
        if (!await DL.Store.readById(storeId)) throw { status: 400, message: 'store not found' }
    } else if (!_admin.storeIds?.includes(storeId)) {
        throw { status: 403, message: 'store not allowed' }
    }

    await DL.Admin.updateOne({ id: _admin.id }, { currentStoreId: storeId })
    if (DL.redis) await DL.redis.del(`admin_auth:${_admin.id}`).catch(() => {})
    return { currentStoreId: storeId }
}

current_store.config = {
    permissions: ['order:pick', 'order:ship', 'order:read']
}
