import { hashApiKey } from './apiKey.js'

export default async function verifyApiKey(req, { DL }) {
    const authHeader = req.headers?.authorization || req.headers?.['x-api-key'] || ''
    if (!authHeader) return null
    let raw = ''
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        raw = authHeader.slice(7).trim()
    } else if (typeof authHeader === 'string') {
        raw = authHeader.trim()
    }
    if (!raw) return null
    const keyHash = hashApiKey(raw)
    const doc = await DL.ApiKey.readOne({ keyHash }, { id: 1, name: 1, domainId: 1, permissions: 1, active: 1, keyPrefix: 1 })
    if (!doc) throw { status: 401, message: 'Invalid API key' }
    if (!doc.active) throw { status: 401, message: 'API key disabled' }
    // touch lastUsedAt async, don't block
    DL.ApiKey.updateOne({ id: doc.id }, { lastUsedAt: new Date() }).catch(() => { })
    return {
        id: `apikey:${doc.id}`,
        apiKeyId: doc.id,
        name: doc.name,
        domainId: doc.domainId,
        permissions: doc.permissions || [],
        isApiKey: true,
        isSuperAdmin: false,
        hasPermission: (permission) => (doc.permissions || []).includes(permission)
    }
}
