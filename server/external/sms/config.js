const DEFAULT_SOURCE = 'Shopik'
const DEFAULT_ENDPOINT = 'https://019sms.co.il/api'

function extractCreds(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value
}

export async function getSmsConfig(DL, domainId) {
    if (!domainId) throw { status: 400, message: 'domainId is required for SMS' }
    const setting = await DL.Setting.readOne({ domainId, key: 'sms:019' })
    const v = extractCreds(setting?.value)
    const token = v.TOKEN_019 || v.token || ''
    const username = v.USERNAME_019 || v.username || ''
    const sourceRaw = v.SMS_SOURCE_019 || v.source || DEFAULT_SOURCE
    const source = String(sourceRaw).slice(0, 11)
    const endpoint = v.SMS_API_URL || v.endpoint || v.apiUrl || DEFAULT_ENDPOINT
    return { token, username, source, endpoint }
}

export default getSmsConfig
