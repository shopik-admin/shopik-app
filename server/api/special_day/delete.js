export default async function remove(payload, { DL }) {
    const { id } = payload

    const existing = await DL.SpecialDay.readById(id)
    if (!existing) throw { status: 404, message: 'special day not found' }

    return DL.SpecialDay.deleteOne({ id })
}

remove.config = {
    required: ['id'],
    permissions: ['order_window_template:update']
}
