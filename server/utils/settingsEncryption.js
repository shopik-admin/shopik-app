import crypto from 'node:crypto'

function getKey() {
    const SECRET = process.env.SECRET
    if (!SECRET) throw new Error('SECRET environment variable is missing')
    return crypto.scryptSync(SECRET, 'settings-salt', 32)
}

export function isEncrypted(str) {
    return typeof str === 'string' && str.startsWith('enc:')
}

export function encryptValue(value) {
    if (value === undefined || value === null) return value
    if (isEncrypted(value)) return value
    const json = JSON.stringify(value)
    const iv = crypto.randomBytes(12)
    const key = getKey()
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    let enc = cipher.update(json, 'utf8', 'base64url')
    enc += cipher.final('base64url')
    const tag = cipher.getAuthTag().toString('base64url')
    return `enc:${iv.toString('base64url')}.${enc}.${tag}`
}

export function decryptValue(encStr) {
    if (!isEncrypted(encStr)) return encStr
    const payload = encStr.slice(4)
    const parts = payload.split('.')
    if (parts.length !== 3) return encStr
    const [ivB64, enc, tagB64] = parts
    try {
        const key = getKey()
        const iv = Buffer.from(ivB64, 'base64url')
        const tag = Buffer.from(tagB64, 'base64url')
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAuthTag(tag)
        let dec = decipher.update(enc, 'base64url', 'utf8')
        dec += decipher.final('utf8')
        return JSON.parse(dec)
    } catch {
        return encStr
    }
}

export function shouldEncryptDoc(doc) {
    if (!doc) return false
    return doc.formType === 'config' || doc.renderType === 'config'
}

export function encryptDocValue(doc) {
    if (!doc || doc.value === undefined || doc.value === null) return doc
    if (!shouldEncryptDoc(doc)) return doc
    if (isEncrypted(doc.value)) return doc
    doc.value = encryptValue(doc.value)
    return doc
}

export function decryptDoc(doc) {
    if (!doc || doc.value === undefined || doc.value === null) return doc
    if (!isEncrypted(doc.value)) return doc
    doc.value = decryptValue(doc.value)
    return doc
}

export function decryptDocs(docs) {
    if (!docs) return docs
    if (Array.isArray(docs)) {
        for (const d of docs) decryptDoc(d)
        return docs
    }
    return decryptDoc(docs)
}
