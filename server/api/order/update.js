import diff from '#common/functions/diff.js'

const USER_DETAILS_FIELDS = ['name', 'phone', 'phoneB', 'email', 'comment']

export default async function update(payload, { DL, _admin, utils }) {
    const { id } = payload

    const order = await DL.Order.readById(id)
    if (!order) throw { status: 400, message: 'order does not exist' }

    const userDetails = {}
    for (const key of USER_DETAILS_FIELDS) {
        if (payload[key] !== undefined) userDetails[key] = payload[key]
    }

    const update = diff(order, userDetails)
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return order

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