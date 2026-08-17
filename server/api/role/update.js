import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, _admin, validators }) {
    const { id } = payload
    const role = await validators.roleId(id, arguments[1])

    const update = diff(role, payload)
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate)
        return role

    if (update.permissions?.some(p => !_admin.hasPermission(p)))
        throw { status: 403, message: 'not authorized' }

    if (update.parentId) {
        const parentRole = await validators.roleId(update.parentId, arguments[1])

        if (update.permissions?.some(p => !parentRole.permissions?.includes(p)))
            throw { status: 400, message: 'invalid permissions' }

        update.parentIds = [...parentRole.parentIds, update.parentId]
    }

    const updated = await DL.Role.updateOne({ id }, update)
    return updated
}

update.config = {
    permissions: 'role:update',
    required: ['id']
}