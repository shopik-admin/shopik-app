export default async function deleteArea(payload, { DL }) {
    const { id } = payload

    const area = await DL.SupplyArea.readById(id)
    if (!area) throw { status: 404, message: 'Supply area not found' }

    return await DL.SupplyArea.deleteOne({ id })
}

deleteArea.config = {
    required: ['id'],
    permissions: ['supply_area:delete']
}