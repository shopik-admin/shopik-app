// Canonical store-visibility rule. Every admin store surface must resolve its
// scope through here — deriving it inline is how this rule drifted into four
// variants that disagreed for `store:all` admins without an explicit storeIds.
//
// Rule: superadmin → everything; explicit storeIds → only those;
// store:all with no storeIds → everything; otherwise → nothing.
// storeIds/currentStoreId ride the cached auth payload (getAdmin), invalidated
// on every admin update / store switch.

const ALL = null   // null scope = every store

// Pure form of the rule, for callers that hold a role's permission list rather
// than a resolved `_admin` — e.g. the admin validator, which checks a *target*
// admin rather than the actor. Keep the two in sync via this function.
export function isUnrestricted({ isSuperAdmin = false, hasPermission, storeIds } = {}) {
    if (isSuperAdmin) return true
    if (storeIds?.length) return false        // an explicit list always narrows
    return typeof hasPermission === 'function' && hasPermission('store:all')
}

// Resolve the acting admin's scope: ALL (null) | string[] of store ids | [] (none).
export default function storeScope({ _admin } = {}) {
    const assigned = _admin?.storeIds?.length ? _admin.storeIds : null
    if (isUnrestricted({
        isSuperAdmin: _admin?.isSuperAdmin,
        hasPermission: _admin?.hasPermission,
        storeIds: assigned
    })) return ALL
    return assigned ?? []
}

// Narrow a client-requested list of store ids against the scope, without erroring.
// ALL scope → the request (or ALL when absent); empty request → the whole scope;
// otherwise the intersection. Never returns anything outside the scope.
export function narrowStoreIds(requested, scope) {
    if (scope === ALL) return requested?.length ? requested : ALL
    if (!requested?.length) return scope
    return requested.filter(id => scope.includes(id))
}

// Guard a client-requested list against the scope. Throws 403 when any requested
// id is outside it. Used where the client named specific stores explicitly, so
// rejecting is correct — and a 403 does not reveal whether the id exists.
export function assertStoreIdsAllowed(requested, scope) {
    if (scope === ALL || !requested?.length) return
    const outside = requested.filter(id => !scope.includes(id))
    if (outside.length) throw { status: 403, message: 'Forbidden stores' }
}

// Constrain a client filter to the scope. ALL scope (see all) passes through; an
// array scope pins filter.id. A requested id narrows within the scope rather than
// widening it.
export function scopeStoreFilter(filter = {}, scope) {
    if (scope === ALL) return filter
    if (filter.id === undefined) return { ...filter, id: { $in: scope } }
    const requested =
        typeof filter.id === 'string' ? [filter.id]
            : Array.isArray(filter.id?.$in) ? filter.id.$in
                : null
    // Unrecognised id shape (operators we don't model) → fall back to the whole
    // scope rather than guessing. Still never wider than the scope.
    if (requested === null) return { ...filter, id: { $in: scope } }
    return { ...filter, id: { $in: narrowStoreIds(requested, scope) } }
}

// Single-store guard for store/id and admin/current_store. Throws 403 when the
// store is outside the scope.
export function assertStoreVisible(id, scope) {
    if (scope !== ALL && !scope.includes(id))
        throw { status: 403, message: 'store not allowed' }
}
