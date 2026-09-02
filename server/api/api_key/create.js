import { generateApiKey, hashApiKey, getApiKeyPrefix } from '#server/utils/auth/apiKey.js'
import apiKeyAllow from '#common/constants/apiKeyPermissions.js'

export default async function create(payload, { DL, _admin }) {
    if (_admin?.isApiKey) throw { status: 403, message: 'Forbidden' }
    if (!_admin?.isSuperAdmin) throw { status: 403, message: 'Forbidden' }
    const { name, domainId, permissions = [] } = payload

    const domain = await DL.Domain.readById(domainId)
    if (!domain) throw { status: 400, message: 'invalid domain id' }

    if (!Array.isArray(permissions)) {
        throw { status: 400, message: 'invalid permissions' }
    }
    const invalid = permissions.filter(p => !apiKeyAllow.includes(p))
    if (invalid.length) throw { status: 400, message: `permissions not allowed for API keys: ${invalid.join(', ')}` }

    const raw = generateApiKey()
    const keyHash = hashApiKey(raw)
    const keyPrefix = getApiKeyPrefix(raw)

    const doc = await DL.ApiKey.create({
        name,
        domainId,
        permissions,
        keyHash,
        keyPrefix,
        active: true,
        createdBy: _admin.id
    })
    return { ...doc, key: raw }
}

create.config = {
    required: ['name', 'domainId'],
    permissions: ['api_key:create']
}
