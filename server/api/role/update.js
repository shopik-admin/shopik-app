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
    await invalidateAdminAuth(DL, id)
    return updated
}

async function invalidateAdminAuth(DL, roleId) {
    try {
        const roles = await DL.Role.Model.find({}, { id: 1, parentId: 1 }).lean()
        const affected = new Set([roleId])
        let grew = true
        while (grew) {
            grew = false
            for (const r of roles) {
                if (r.parentId && affected.has(r.parentId) && !affected.has(r.id)) {
                    affected.add(r.id)
                    grew = true
                }
            }
        }
        const affectedAdmins = await DL.Admin.Model.find(
            { roleId: { $in: [...affected] } },
            { id: 1 }
        ).lean()
        await Promise.all(affectedAdmins.map(a => DL.redis?.del(`admin_auth:${a.id}`)))
    } catch {}
}

update.config = {
    permissions: 'role:update',
    required: ['id']
}