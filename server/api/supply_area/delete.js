export default async function deleteArea(payload, { DL }) {
    const { id } = payload

    const area = await DL.SupplyArea.readById(id)
    if (!area) throw { status: 404, message: 'Supply area not found' }

    const result = await DL.SupplyArea.deleteOne({ id })

    // Remove dangling references from area groups
    try {
        await DL.AreaGroup?.Model.updateMany({ areaIds: id }, { $pull: { areaIds: id } })
    } catch {}

    return result
}

deleteArea.config = {
    required: ['id'],
    permissions: ['supply_area:delete']
}