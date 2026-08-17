import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, _admin }) {
    const { id } = payload

    const order = await DL.Order.readById(id)
    if (!order) throw { status: 400, message: 'order does not exist' }

    const update = diff(order, payload)
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return order

    const updated = await DL.Order.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['order:update']
}
