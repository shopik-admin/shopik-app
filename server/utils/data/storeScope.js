// Shared store-visibility scope for admin store endpoints (store/read, store/count,
// store/id, store/nearby) and the stores list in getLists.
// Rule: superadmin → everything; explicit storeIds → only those; store:all with
// no storeIds → everything; otherwise → nothing. storeIds/currentStoreId ride the
// cached auth payload (getAdmin), invalidated on every admin update / store switch.
export default function storeScope({ _admin }) {
    if (_admin.isSuperAdmin) return null
    if (_admin.storeIds?.length) return _admin.storeIds
    if (typeof _admin.hasPermission === 'function' && _admin.hasPermission('store:all')) return null
    return []
}

// Constrain a client filter to the scope. null scope (see all) passes through;
// an array scope (empty = match nothing) pins filter.id.
export function scopeStoreFilter(filter = {}, scope) {
    return scope === null ? filter : { ...filter, id: { $in: scope } }
}

// Single-store guard for store/id. Throws 403 when the store is outside the scope.
export function assertStoreVisible(id, scope) {
    if (scope !== null && !scope.includes(id))
        throw { status: 403, message: 'store not allowed' }
}
