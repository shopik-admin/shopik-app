import crypto from 'node:crypto'

const SECRET = process.env.SECRET

if (!SECRET) {
    throw new Error('SECRET environment variable is missing')
}

// Derive a 32-byte key matching the encryption setup
const SECRET_KEY = crypto.scryptSync(SECRET, 'salt', 32)

function decryptPayload(encodedIv, encryptedData, encodedAuthTag) {
    const iv = Buffer.from(encodedIv, 'base64url')
    const authTag = Buffer.from(encodedAuthTag, 'base64url')

    const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET_KEY, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedData, 'base64url', 'utf8')
    decrypted += decipher.final('utf8') // Throws an error if payload or authTag was tampered with

    return JSON.parse(decrypted)
}

export default function verifyToken(token) {
    if (!token || typeof token !== 'string') {
        throw { status: 401, message: 'unauthorized' }
    }

    try {
        const parts = token.split('.')

        // Expecting: iv . encryptedPayload . authTag
        if (parts.length !== 3) throw new Error()

        const [iv, encryptedPayload, authTag] = parts

        // Decrypt (this automatically checks for tampering via GCM Auth Tag)
        const payload = decryptPayload(iv, encryptedPayload, authTag)

        if (typeof payload.exp !== 'number') throw new Error()

        if (Date.now() > payload.exp) throw new Error()

        return { id: payload.id }
    } catch {
        throw { status: 401, message: 'unauthorized' }
    }
}