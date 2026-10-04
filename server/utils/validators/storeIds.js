import { isUnrestricted } from '#server/utils/data/storeScope.js'

// Normalizes + validates an admin's store assignment in place on `payload`:
//   storeIds       → deduped array of existing store ids (omitted keys left alone)
//   currentStoreId → '' becomes null; a stale one (outside the admin's stores)
//                    is cleared, not rejected — except for unrestricted admins
//                    (super / store:all with no stores), who may keep any store.
// `existing` is the admin's current doc (update) or null (create), so the check
// runs against the post-update value either way.
//
// The unrestricted test is the shared `isUnrestricted` from storeScope, so this
// validator and the request path can never disagree about who sees what.
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
        const permissions = role?.permissions
        const unrestricted = isUnrestricted({
            isSuperAdmin: permissions?.includes('admin:super'),
            hasPermission: p => !!permissions?.includes(p),
            storeIds: effectiveStoreIds
        })
        if (!unrestricted) payload.currentStoreId = null
    }
}
