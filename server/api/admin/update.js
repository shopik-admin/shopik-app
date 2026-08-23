import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, validators, utils }) {

    const { id } = payload
    const admin = await DL.Admin.readById(id)
    if (!admin)
        throw { status: 400, message: 'admin does not exist' }

    await validators.roleId(admin.roleId, arguments[1])

    const name = utils.extractFields.getName(payload)
    if (name) payload.name = name

    const update = diff(admin, payload)

    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate)
        return admin

    if (update.roleId) {
        await validators.roleId(update.roleId, arguments[1])
        await DL.redis?.del(`admin_auth:${id}`)
    }

    const updated = await DL.Admin.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: 'admin:update'
}
