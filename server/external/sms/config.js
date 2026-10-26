const DEFAULT_SOURCE = 'Shopik'
const DEFAULT_ENDPOINT = 'https://019sms.co.il/api'
const DEFAULT_VOICE = {
    enabled: false,
    type: 2,
    voice: 'ymMale',
    repeat: 2,
    rate: 0
}
const VOICE_TYPES = [2, 3, 4]
const VOICES = ['ymMale', 'ymFemale']

function extractCreds(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value
}

function toBool(value) {
    if (value === true || value === 1) return true
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
    return false
}

function toInt(value, min, max, fallback) {
    const number = Number.parseInt(value, 10)
    if (!Number.isFinite(number)) return fallback
    return Math.min(max, Math.max(min, number))
}

/**
 * Voice-call settings for 019 TTS (kosher phones only).
 * `type` 2 = SMS to regular phones, voice call to kosher phones.
 * `enabled` false keeps plain SMS; it is the per-domain rollout switch.
 */
function sanitizeVoice(value) {
    const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    const type = toInt(v.type, 0, 99, DEFAULT_VOICE.type)
    return {
        enabled: toBool(v.enabled),
        type: VOICE_TYPES.includes(type) ? type : DEFAULT_VOICE.type,
        voice: VOICES.includes(v.voice) ? v.voice : DEFAULT_VOICE.voice,
        repeat: toInt(v.repeat, 1, 5, DEFAULT_VOICE.repeat),
        rate: toInt(v.rate, -10, 10, DEFAULT_VOICE.rate)
    }
}

function extractVoice(creds) {
    const raw = creds.VOICE ?? creds.voice ?? creds.tts
    const voice = sanitizeVoice(raw)
    return { ...voice, enabled: raw === true || voice.enabled }
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
    return { token, username, source, endpoint, voice: extractVoice(v) }
}

export { DEFAULT_VOICE, extractVoice, sanitizeVoice }
export default getSmsConfig
