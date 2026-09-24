// Shared store-visibility scope for admin store endpoints (store/read, store/count,
// store/id, store/nearby) and the stores list in getLists.
// Rule: superadmin → everything; explicit storeIds → only those;
// store:all with no storeIds → everything; otherwise → nothing.
export default async function storeScope({ DL, _admin }) {
    if (_admin.isSuperAdmin) return null
    const admin = await DL.Admin.readById(_admin.id)
    if (admin?.storeIds?.length) return admin.storeIds
    if (typeof _admin.hasPermission === 'function' && _admin.hasPermission('store:all')) return null
    return []
}

// Intersect a client filter with the scope. null scope passes through;
// an array scope (empty = match nothing) constrains filter.id.
export function scopeStoreFilter(filter = {}, scope) {
    if (scope === null) return filter
    const { id, ...rest } = filter
    let ids
    if (id === undefined) ids = scope
    else if (typeof id === 'string') ids = scope.includes(id) ? [id] : []
    else if (Array.isArray(id?.$in)) ids = id.$in.filter(x => scope.includes(x))
    else ids = scope
    return { ...rest, id: { $in: ids } }
}

// Single-store guard for store/id. Throws 403 when the store is outside the scope.
export function assertStoreVisible(id, scope) {
    if (scope !== null && !scope.includes(id))
        throw { status: 403, message: 'store not allowed' }
}
