export default async function read(payload, { DL, _admin }) {
    // TODO: admin.filter
    const { filter = {}, select } = payload
    const docs = await DL.Admin.read(filter, select, payload)

    return DL.populate(docs, 'roleId', { name: 'roleName' })
}

read.config = {
    permissions: ['admin:read']
}