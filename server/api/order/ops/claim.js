export default async function claim(payload, { DL, _admin, utils }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'order id required' }

    const fullAdmin = await DL.Admin.readById(_admin.id)
    const adminName = `${_admin.name?.first ?? ''} ${_admin.name?.last ?? ''}`.trim()

    const order = await DL.Order.Model.findOneAndUpdate(
        { id, status: 'paid' },
        {
            $set: {
                status: 'picking',
                pickStart: new Date(),
                picker: { adminId: _admin.id, name: adminName }
            }
        },
        { new: true }
    ).lean()

    if (!order) throw { status: 409, message: 'order is already being picked or not available' }

    // store scope sanity — revert if store mismatch
    if (fullAdmin?.currentStoreId && order.storeId !== fullAdmin.currentStoreId) {
        await DL.Order.Model.updateOne({ id }, { $set: { status: 'paid', picker: null, pickStart: null } }).lean()
        throw { status: 403, message: 'order store mismatch' }
    }

    // history: owner
    try {
        await DL.Owner.create({
            orderId: id,
            adminId: _admin.id,
            adminName,
            start: new Date(),
            type: 'picking',
            status: 'active'
        })
    } catch {}

    try {
        const { record, adminActor } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.ORDER_STATUS_UPDATE,
            actor: adminActor(_admin),
            changes: { oldData: { status: 'paid' }, newData: { status: 'picking', picker: { adminId: _admin.id } } },
            context: { step: 'pick_claim' },
            metadata: { source: 'order/ops/claim' }
        })
    } catch {}

    return order
}

claim.config = {
    permissions: ['order:pick'],
    preventMultiple: p => ':' + (p.id || '')
}
