export default async function pack(payload, { DL, _admin, utils }) {
    const { id, bags, boxes } = payload
    if (!id) throw { status: 400, message: 'id required' }

    const order = await DL.Order.readById(id)
    if (!order) throw { status: 404, message: 'order not found' }
    if (order.status !== 'picked') throw { status: 400, message: 'order not in picked' }
    // order:pick implies pack — allow owner or anyone with pick if unowned picked queue
    const isOwner = order.picker?.adminId === _admin.id
    const isUnowned = !order.picker?.adminId
    if (!isOwner && !isUnowned) throw { status: 403, message: 'not your order' }

    const adminName = `${_admin.name?.first ?? ''} ${_admin.name?.last ?? ''}`.trim()

    const set = {
        status: 'packed',
        picker: null
    }
    if (bags) set.bags = bags
    if (boxes) set.boxes = boxes

    const updated = await DL.Order.Model.findOneAndUpdate(
        { id, status: 'picked' },
        { $set: set },
        { new: true }
    ).lean()

    if (!updated) throw { status: 409, message: 'status changed' }

    try {
        await DL.Owner.updateOne({ orderId: id, type: 'picking', status: 'active' }, { status: 'done', end: new Date() })
    } catch {}
    try {
        await DL.PickHistory.create({
            orderId: id, storeId: order.storeId, adminId: _admin.id, adminName, action: 'pack', barcode: 'ORDER',
            pickedAt: new Date(), windowDate: order.window?.date
        })
    } catch {}

    try {
        const { record, adminActor } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.ORDER_STATUS_UPDATE,
            actor: adminActor(_admin),
            changes: { oldData: { status: 'picked' }, newData: { status: 'packed', bags, boxes } },
            context: { step: 'pack' },
            metadata: { source: 'order/ops/pack' }
        })
    } catch {}

    return updated
}

pack.config = {
    permissions: ['order:pick']
}
