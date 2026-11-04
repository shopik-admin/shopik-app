import diff from '#common/functions/diff.js'

const USER_DETAILS_FIELDS = ['name', 'phone', 'secondPhone', 'email', 'comment']

// NOTE: order/update never changes status. Status transitions are side effects
// of the order lifecycle endpoints only:
//   payment/hyp/callback (cart -> paid) | order/ops/claim (paid -> picking)
//   order/ops/release (picking/picked -> paid) | order/ops/pick_complete (picking -> picked)
//   order/ops/pack (picked -> packed, incl. the sole Hyp capture)
//   shipment/start (packed -> shipped) | shipment/cancel (shipped -> packed)
//   shipment/deliver (shipped -> done) | payment/cancel (-> canceled)
// Each of those records an ORDER_STATUS_UPDATE timeline entry.
export default async function update(payload, { DL, _admin, utils }) {
    const { id } = payload

    const order = await DL.Order.readById(id)
    if (!order) throw { status: 400, message: 'order does not exist' }

    if (payload.status !== undefined && payload.status !== order.status)
        throw { status: 400, message: 'status changes are not allowed via order/update' }

    const userDetails = {}
    for (const key of USER_DETAILS_FIELDS) {
        if (payload[key] !== undefined) userDetails[key] = payload[key]
    }

    const update = diff(order, userDetails)

    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) {
        return order
    }

    const updated = await DL.Order.updateOne({ id }, update)

    const oldData = {}
    for (const key of Object.keys(update)) oldData[key] = order[key]

    const { record, adminActor } = utils.data.timeline
    await record({
        DL,
        order,
        eventType: DL.Timeline.constants.EVENT_TYPES.ORDER_DETAILS,
        actor: adminActor(_admin),
        changes: { oldData, newData: update }
    })

    return updated
}

update.config = {
    required: ['id'],
    permissions: ['order:update']
}
