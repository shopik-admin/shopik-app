export default async function read(payload, { DL, _admin }) {
    if (_admin?.isApiKey) throw { status: 403, message: 'Forbidden' }
    if (!_admin?.isSuperAdmin) throw { status: 403, message: 'Forbidden' }
    const { filter = {}, select } = payload
    return DL.ApiKey.read(filter, select, payload)
}

read.config = {
    permissions: ['api_key:read']
}
