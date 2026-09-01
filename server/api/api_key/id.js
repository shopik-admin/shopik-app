export default async function id({ id }, { DL, _admin }) {
    if (_admin?.isApiKey) throw { status: 403, message: 'Forbidden' }
    if (!_admin?.isSuperAdmin) throw { status: 403, message: 'Forbidden' }
    return DL.ApiKey.readById(id)
}

id.config = {
    required: ['id'],
    permissions: ['api_key:id']
}
