import diff from '#common/functions/diff.js'

export default async function update(payload, { DL }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'Missing id' }

    const group = await DL.AreaGroup.readById(id)
    if (!group) throw { status: 404, message: 'Area group not found' }

    const update = diff(group, payload)
    if (Object.keys(update).length === 0) return group

    if (update.name != null) update.name = update.name.trim()

    const targetName = update.name ?? group.name
    const targetStoreId = update.storeId ?? group.storeId
    if ((update.name != null || update.storeId != null) && (!targetName || !targetStoreId))
        throw { status: 400, message: 'Missing required fields: name, storeId' }

    if (update.areaIds != null) {
        if (!Array.isArray(update.areaIds))
            throw { status: 400, message: 'areaIds must be an array of supply area ids' }
        update.areaIds = [...new Set(update.areaIds.filter(areaId => typeof areaId === 'string' && areaId.trim()))]
    }

    if (update.name != null || update.storeId != null) {
        const duplicate = await DL.AreaGroup.readOne({ name: targetName, storeId: targetStoreId })
        if (duplicate && duplicate.id !== id)
            throw { status: 409, message: 'An area group with this name already exists for this store' }
    }

    return await DL.AreaGroup.updateOne({ id }, update)
}

update.config = {
    required: ['id'],
    permissions: ['supply_area:update']
}
