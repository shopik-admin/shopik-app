export default async function deleteGroup(payload, { DL }) {
    const { id } = payload

    const group = await DL.AreaGroup.readById(id)
    if (!group) throw { status: 404, message: 'Area group not found' }

    return await DL.AreaGroup.deleteOne({ id })
}

deleteGroup.config = {
    required: ['id'],
    permissions: ['supply_area:delete']
}
