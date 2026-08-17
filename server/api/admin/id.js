export default async function id({ id }, { DL, _admin }) {
    // TODO: admin.filter
    const admin = await DL.Admin.readById(id)
    return admin
}

id.config = {
    permissions: ['admin:id']
}
