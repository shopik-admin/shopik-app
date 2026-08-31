import allPermissions from '#server/utils/auth/permissions.js'
function buildTree(roles, parentRole) {
    const tree = roles.filter(role => role.parentId === parentRole.id).map(role => ({
        ...role,
        children: buildTree(roles, role),
        possiblePermissions: parentRole.permissions
    }))
    return tree
}

export default async function tree({ }, { DL, _admin }) {
    const role = { ..._admin.role }

    if (_admin.isSuperAdmin)
        role.permissions = allPermissions

    const children = await DL.Role.read(
        { parentIds: _admin.roleId },
        {
            _id: 0,
            name: 1,
            parentId: 1,
            id: 1,
            permissions: 1
        },
        { limit: 0 }
    )

    const tree = {
        ...role,
        children: buildTree(children, role)
    }
    return tree
}

tree.config = {
    permissions: 'role:read'
}