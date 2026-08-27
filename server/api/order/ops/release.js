export default async function release(payload, { DL, _admin, utils }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'id required' }

    const order = await DL.Order.readById(id)
    if (!order) throw { status: 404, message: 'order not found' }
    if (!['picking', 'picked'].includes(order.status)) throw { status: 400, message: 'order not releasable' }

    const updated = await DL.Order.Model.findOneAndUpdate(
        { id },
        { $set: { picker: null, status: 'paid', pickStart: null, pickingReleaseCount: (order.pickingReleaseCount || 0) + 1 }, $unset: { pickEnd: 1 } },
        { new: true }
    ).lean()

    try { await DL.Owner.updateOne({ orderId: id, adminId: _admin.id, type: 'picking', status: 'active' }, { status: 'done', end: new Date() }) } catch {}

    try {
        const { record, adminActor } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.ORDER_STATUS_UPDATE,
            actor: adminActor(_admin),
            changes: { oldData: { status: order.status, picker: order.picker }, newData: { status: 'paid', picker: null } },
            context: { step: 'pick_release' },
            metadata: { source: 'order/ops/release' }
        })
    } catch {}

    return updated
}

release.config = {
    permissions: ['order:pick', 'order:pick:manage']
}
