export default async function roleValidator(roleId, { DL, _admin }) {
    if (!roleId)
        throw { status: 400, message: 'role id is required' }

    const validRoleId = typeof roleId === 'string' && roleId.length > 0
    if (!validRoleId)
        throw { status: 400, message: 'invalid role id type' }

    const role = await DL.Role.readById(roleId)
    if (!role)
        throw { status: 400, message: 'invalid role id' }

    const adminCanViewRole =
        role.parentIds.includes(_admin.roleId) ||
        _admin.isSuperAdmin
    if (!adminCanViewRole)
        throw { status: 403, message: 'not authorized' }

    return role
}