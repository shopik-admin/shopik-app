export default async function remove(payload, { DL, _admin }) {
    if (_admin?.isApiKey) throw { status: 403, message: 'Forbidden' }
    if (!_admin?.isSuperAdmin) throw { status: 403, message: 'Forbidden' }
    const { id } = payload
    const existing = await DL.ApiKey.readById(id)
    if (!existing) throw { status: 400, message: 'api key does not exist' }
    await DL.ApiKey.deleteOne({ id })
    return { id }
}

remove.config = {
    required: ['id'],
    permissions: ['api_key:delete']
}
