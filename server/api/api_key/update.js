import diff from '#common/functions/diff.js'
import apiKeyAllow from '#common/constants/apiKeyPermissions.js'

export default async function update(payload, { DL, _admin }) {
    if (_admin?.isApiKey) throw { status: 403, message: 'Forbidden' }
    if (!_admin?.isSuperAdmin) throw { status: 403, message: 'Forbidden' }
    const { id } = payload
    const existing = await DL.ApiKey.readById(id)
    if (!existing) throw { status: 400, message: 'api key does not exist' }

    const patch = diff(existing, payload)
    // never allow keyHash/keyPrefix to be patched directly
    delete patch.keyHash
    delete patch.keyPrefix
    delete patch.createdBy
    // domain change must be valid
    if (patch.domainId) {
        const domain = await DL.Domain.readById(patch.domainId)
        if (!domain) throw { status: 400, message: 'invalid domain id' }
    }
    if (patch.permissions !== undefined) {
        if (!Array.isArray(patch.permissions)) {
            throw { status: 400, message: 'invalid permissions' }
        }
        const invalid = patch.permissions.filter(p => !apiKeyAllow.includes(p))
        if (invalid.length) throw { status: 400, message: `permissions not allowed for API keys: ${invalid.join(', ')}` }
    }
    if (Object.keys(patch).length === 0) return existing
    const updated = await DL.ApiKey.updateOne({ id }, patch)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['api_key:update']
}
