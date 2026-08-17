export default async function id({ id }, { DL, _admin }) {
    const setting = await DL.Setting.readById(id)
    return setting
}

id.config = {
    required: ['id'],
    permissions: ['setting:id']
}