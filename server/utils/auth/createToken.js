import crypto from 'node:crypto'

const SECRET = process.env.SECRET

if (!SECRET) {
    throw new Error('SECRET environment variable is missing')
}

// Secret key must be 32 bytes (256 bits)
const SECRET_KEY = crypto.scryptSync(SECRET, 'salt', 32)

export default function createEncryptedToken(id, expiresAfterMs) {
    const payload = JSON.stringify({
        id,
        exp: Date.now() + expiresAfterMs
    })

    const iv = crypto.randomBytes(12) // Initialization vector
    const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY, iv)

    let encrypted = cipher.update(payload, 'utf8', 'base64url')
    encrypted += cipher.final('base64url')

    const authTag = cipher.getAuthTag().toString('base64url')

    // Format: IV . EncryptedPayload . AuthTag
    return `${iv.toString('base64url')}.${encrypted}.${authTag}`
}