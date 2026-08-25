export default async function remove(payload, { DL }) {
    const { id } = payload

    const existing = await DL.SpecialDay.Model.findOne({ id }, { _id: 0 }).lean()
    if (!existing) throw { status: 404, message: 'special day not found' }

    return DL.SpecialDay.deleteOne({ id })
}

remove.config = {
    required: ['id'],
    permissions: ['order_window_template:update']
}
