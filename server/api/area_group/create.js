export default async function create(payload, { DL }) {
    const { name, storeId, areaIds } = payload

    if (!name || !storeId)
        throw { status: 400, message: 'Missing required fields: name, storeId' }

    if (areaIds != null && !Array.isArray(areaIds))
        throw { status: 400, message: 'areaIds must be an array of supply area ids' }

    const duplicate = await DL.AreaGroup.readOne({ name: name.trim(), storeId })
    if (duplicate)
        throw { status: 409, message: 'An area group with this name already exists for this store' }

    const sanitizedAreaIds = [...new Set((areaIds || []).filter(id => typeof id === 'string' && id.trim()))]

    return await DL.AreaGroup.create({ name, storeId, areaIds: sanitizedAreaIds })
}

create.config = {
    required: ['name', 'storeId'],
    permissions: ['supply_area:create'],
    preventMultiple: true
}
