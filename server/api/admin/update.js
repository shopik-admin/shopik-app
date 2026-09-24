import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, validators, utils }) {

    const { id } = payload
    const admin = await DL.Admin.readById(id)
    if (!admin)
        throw { status: 400, message: 'admin does not exist' }

    await validators.roleId(admin.roleId, arguments[1], true)

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

    const update = diff(admin, payload)

    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate)
        return admin

    if (update.roleId) {
        await validators.roleId(update.roleId, arguments[1], true)
    }

    if (update.roleId || update.storeIds || 'currentStoreId' in update) {
        await DL.redis?.del(`admin_auth:${id}`)
    }

    if (update.idNum) {
        await validators.idNum(update.idNum, arguments[1])
    }

    const effectiveStoreIds = update.storeIds ?? admin.storeIds ?? []
    const effectiveCurrent = 'currentStoreId' in update ? update.currentStoreId : admin.currentStoreId
    if (effectiveCurrent != null && !effectiveStoreIds.includes(effectiveCurrent))
        throw { status: 400, message: 'current store must be one of the admin stores' }

    const updated = await DL.Admin.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: 'admin:update'
}
