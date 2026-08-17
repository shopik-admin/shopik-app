export default async function children({ id }, { DL, _admin }) {
    const role = await DL.Role.readById(id)
    if (!role) throw {
        status: 400,
        message: 'role not found'
    }

    const adminCanViewRole = (
        _admin.isSuperAdmin ||
        _admin.roleId === role.id ||
        role.parentIds.includes(_admin.roleId)
    )
    if (!adminCanViewRole)
        throw {
            status: 403,
            message: 'not authorized'
        }

    const children = await DL.Role.read({ parentIds: id })
    return children
}

children.config = {
    required: ['id'],
    permissions: ['role:read']
}