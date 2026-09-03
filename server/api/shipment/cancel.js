export default async function cancel(payload, { DL, _admin, utils }) {
    const { shipmentId } = payload
    if (!shipmentId) throw { status: 400, message: 'shipmentId required' }

    const shipment = await DL.Shipment.readById(shipmentId)
    if (!shipment) throw { status: 404, message: 'shipment not found' }
    if (shipment.status !== 'active') throw { status: 400, message: 'not active' }

    await DL.Shipment.updateOne({ id: shipmentId }, { status: 'canceled', completedAt: new Date() })
    await DL.Order.Model.updateMany({ id: { $in: shipment.orderIds }, status: 'shipped' }, { $set: { status: 'packed', shipper: null, shipmentId: null } })
    try { await DL.Owner.updateMany({ orderId: { $in: shipment.orderIds }, type: 'shipping', status: 'active' }, { status: 'done', end: new Date() }) } catch {}

    try {
        for (const oid of shipment.orderIds) {
            const o = await DL.Order.readById(oid)
            if (!o) continue
            const { record, adminActor } = utils.data.timeline
            await record({ DL, order: o, eventType: DL.Timeline.constants.EVENT_TYPES.ORDER_STATUS_UPDATE, actor: adminActor(_admin), changes: { oldData: { status: 'shipped' }, newData: { status: 'packed' } }, context: { step: 'shipment_cancel', shipmentId }, metadata: { source: 'shipment/cancel' } })
        }
        await DL.ShipHistory.create({ shipmentId, storeId: shipment.storeId, shipperAdminId: _admin.id, type: 'cancel', at: new Date(), orderIds: shipment.orderIds })
    } catch {}

    return { canceled: true }
}

cancel.config = {
    permissions: ['order:ship:manage']
}
