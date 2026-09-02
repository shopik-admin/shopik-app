export default async function remove({ id }, info) {
    const { DL, _admin, validators } = info
    const role = await validators.roleId(id, info)

    if (role.id === _admin.roleId)
        throw { status: 400, message: 'cannot delete your own role' }

    const childRoles = await DL.Role.read({ parentId: id }, { id: 1 })
    if (childRoles.length)
        throw { status: 400, message: 'role has child roles' }

    const assignedAdmin = await DL.Admin.Model.findOne({ roleId: id }, { _id: 0, id: 1 }).lean()
    if (assignedAdmin)
        throw { status: 400, message: 'role is assigned to admins' }

    await DL.Role.deleteOne({ id })

    return { id }
}

remove.config = {
    permissions: 'role:delete',
    required: ['id']
}
