export default async function create(payload, { DL, _admin }) {
    const {
        name,
        permissions = [],
        parentId
    } = payload

    if (permissions.some(p => !_admin.hasPermission(p)))
        throw { status: 403, message: 'not authorized' }

    let parentIds = []
    if (parentId) {
        const parentRole = await DL.Role.readById(parentId)
        if (!parentRole)
            throw {
                status: 400,
                message: 'invalid parent id'
            }
        if (permissions.some(p => !parentRole.permissions.includes(p)))
            throw {
                status: 400,
                message: 'invalid permissions'
            }
        parentIds = [...parentRole.parentIds, parentId]
    } else if (!_admin.isSuperAdmin) {
        throw { status: 403, message: 'not authorized' }
    }
    const role = {
        name,
        permissions,
        parentId,
        parentIds
    }
    const created = await DL.Role.create(role)
    return created
}

create.config = {
    permissions: ['role:create'],
    required: ['name', 'parentId']
}