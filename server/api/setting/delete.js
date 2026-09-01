export default async function remove(payload, { DL }) {
    const { id } = payload

    const setting = await DL.Setting.readById(id)
    if (!setting)
        throw { status: 400, message: 'setting does not exist' }

    await DL.Setting.deleteOne({ id })
    return { id }
}

remove.config = {
    required: ['id'],
    permissions: ['setting:delete']
}
