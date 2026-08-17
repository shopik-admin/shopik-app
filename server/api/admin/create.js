export default async function create(payload, { DL, validators, utils }) {
    await validators.roleId(payload.roleId, arguments[1])

    const name = utils.extractFields.getName(payload)
    if (name) payload.name = name

    const created = await DL.Admin.create(payload)
    return created
}

create.config = {
    permissions: ['admin:create']
}