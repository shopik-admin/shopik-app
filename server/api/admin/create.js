export default async function create(payload, { DL, validators, utils }) {
    await validators.idNum(payload.idNum, arguments[1])
    await validators.roleId(payload.roleId, arguments[1], true)

    const name = utils.extractFields.getName(payload)
    if (name) payload.name = name

    if (payload.storeIds !== undefined) {
        if (!Array.isArray(payload.storeIds)) throw { status: 400, message: 'storeIds must be an array' }
        payload.storeIds = [...new Set(payload.storeIds.filter(Boolean))]
        if (payload.storeIds.length) {
            const found = await DL.Store.Model.distinct('id', { id: { $in: payload.storeIds } })
            if (found.length !== payload.storeIds.length) throw { status: 400, message: 'store not found' }
        }
    }
    if (payload.currentStoreId === '') payload.currentStoreId = null
    if (payload.currentStoreId != null) {
        if (!(payload.storeIds || []).includes(payload.currentStoreId))
            throw { status: 400, message: 'current store must be one of the admin stores' }
    }

    const created = await DL.Admin.create(payload)
    return created
}

create.config = {
    permissions: ['admin:create']
}