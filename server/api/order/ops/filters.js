import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'
import { CART, opsScope } from '#common/functions/opsView.js'

const MAIN_FIELDS = ['status', 'deliveryMethod', 'window.date']

// Filter descriptors for the ops queue, per role: the status list a role may pick,
// and the store pill only for the contractor, who works across the stores he owns.
// Every other role is scoped to one current store, so a store pill would have no effect.
export default async function filters(payload, { DL, _admin }) {
    const scope = opsScope({ hasPermission: _admin.hasPermission, isSuperAdmin: _admin.isSuperAdmin })
    if (!scope) throw { status: 403, message: 'Forbidden' }

    const main = scope.stores === 'scope' ? ['storeId', ...MAIN_FIELDS] : MAIN_FIELDS
    const statuses = scope.statuses
        || (DL.Order.Model.schema.path('status').enumValues || []).filter(s => s !== CART)

    // storeId is a filter field on the schema, so it would show in the overflow for
    // the single-store roles too — where picking a store has no effect, because the
    // queue is pinned to the current store.
    return buildFilterDescriptors(DL.Order, main)
        .filter(d => d.key !== 'storeId' || scope.stores === 'scope')
        .map(d => d.key === 'status' ? { ...d, options: statuses } : d)
}

filters.config = {
    permissions: ['order:read', 'order:pick', 'order:ship', 'order:pick:manage', 'order:ship:manage']
}
