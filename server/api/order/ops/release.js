import storeScope, { assertStoreVisible } from '#server/utils/data/storeScope.js'

// A release puts the order back into the picking queue with its scan progress
// kept, so picking (still open) and picked (finished but not packed) can both be
// released by the owner or by a manager.
const RELEASABLE_STATUSES = ['picking', 'picked']

export default async function release(payload, { DL, _admin, utils }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'id required' }

    const order = await DL.Order.readById(id)
    if (!order) throw { status: 404, message: 'order not found' }
    if (!RELEASABLE_STATUSES.includes(order.status)) throw { status: 400, message: 'order not releasable' }

    // Managers may release any picking order; a picker may only release their own.
    const isManager = _admin.hasPermission('order:pick:manage')
    const isOwner = order.picker?.adminId === _admin.id
    if (!isManager && !isOwner) throw { status: 403, message: 'not your order' }

    // Never let an admin act on a store outside their assigned scope.
    assertStoreVisible(order.storeId, storeScope({ _admin }))

    // Guard on the status we checked, so a concurrent pick_complete or pack wins
    // instead of being overwritten.
    const updated = await DL.Order.updateOne(
        { id, status: order.status },
        {
            $set: {
                picker: null,
                status: 'paid',
                pickStart: null,
                pickingReleaseCount: (order.pickingReleaseCount || 0) + 1
            },
            $unset: { pickEnd: 1 }
        }
    )
    if (!updated) throw { status: 409, message: 'status changed' }

    // Close the picker's active work row. The manager releasing the order is not
    // necessarily the picker, so match the order's active row, not the actor.
    try { await DL.Owner.updateOne({ orderId: id, type: 'picking', status: 'active' }, { status: 'done', end: new Date() }) } catch { }

    try {
        const { record, adminActor } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.ORDER_STATUS_UPDATE,
            actor: adminActor(_admin),
            changes: { oldData: { status: order.status, picker: order.picker }, newData: { status: 'paid', picker: null } },
            context: { step: 'pick_release' },
            metadata: { source: 'order/ops/release', releasedPickerId: order.picker?.adminId }
        })
    } catch { }

    return updated
}

release.config = {
    permissions: ['order:pick', 'order:pick:manage']
}
