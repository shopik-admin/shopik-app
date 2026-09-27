// Normalizes + validates an admin's store assignment in place on `payload`:
//   storeIds       → deduped array of existing store ids (omitted keys left alone)
//   currentStoreId → '' becomes null; a stale one (outside the admin's stores)
//                    is cleared, not rejected — except for unrestricted admins
//                    (super / store:all with no stores), who may keep any store.
// `existing` is the admin's current doc (update) or null (create), so the check
// runs against the post-update value either way.
export default async function storeIdsValidator(payload, { DL }, existing = null) {
    if (payload.storeIds !== undefined) {
        if (!Array.isArray(payload.storeIds)) throw { status: 400, message: 'storeIds must be an array' }
        payload.storeIds = [...new Set(payload.storeIds.filter(Boolean))]
        if (payload.storeIds.length) {
            const found = await DL.Store.Model.distinct('id', { id: { $in: payload.storeIds } })
            if (found.length !== payload.storeIds.length) throw { status: 400, message: 'store not found' }
        }
    }

    if (payload.currentStoreId === '') payload.currentStoreId = null

    const effectiveStoreIds = payload.storeIds ?? existing?.storeIds ?? []
    const effectiveCurrent = 'currentStoreId' in payload ? payload.currentStoreId : existing?.currentStoreId
    if (effectiveCurrent != null && !effectiveStoreIds.includes(effectiveCurrent)) {
        const roleId = payload.roleId ?? existing?.roleId
        const role = roleId ? await DL.Role.readById(roleId) : null
        const unrestricted = role?.permissions?.includes('admin:super') ||
            (role?.permissions?.includes('store:all') && !effectiveStoreIds.length)
        if (!unrestricted) payload.currentStoreId = null
    }
}
