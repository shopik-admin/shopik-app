import crypto from 'crypto'

export function generateApiKey() {
    return 'sk_' + crypto.randomBytes(32).toString('base64url')
}

export function hashApiKey(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex')
}

export function getApiKeyPrefix(raw) {
    return raw.slice(0, 12)
}
