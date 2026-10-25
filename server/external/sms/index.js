import { DEFAULT_VOICE, getSmsConfig, sanitizeVoice } from './config.js'
import { resolveOtpMessage } from './otpMessage.js'

function normalizePhone(raw) {
    let d = String(raw).replace(/\D/g, '')
    if (d.startsWith('972')) d = '0' + d.slice(3)
    if (d.length === 9 && d.startsWith('5')) d = '0' + d
    return d
}

function isValidPhone(d) {
    return /^0?5\d{8}$/.test(d)
}

export function buildSmsBody({ username, source, phones, message, tts }) {
    const body = {
        sms: {
            user: { username },
            source,
            destinations: { phone: phones.length === 1 ? phones[0] : phones },
            message
        }
    }
    if (tts) body.sms.tts = tts
    return body
}

/**
 * `voice: true`      -> use the domain config, only when VOICE.enabled is on.
 * `voice: {...}`     -> explicit override (admin dev tools); ignores `enabled`.
 * falsy              -> plain SMS.
 */
function resolveTts(requested, voiceConfig) {
    if (!requested) return null
    const base = voiceConfig || DEFAULT_VOICE
    if (requested === true) {
        if (!base.enabled) return null
        return { type: base.type, voice: base.voice, repeat: base.repeat, rate: base.rate }
    }
    if (typeof requested === 'object') {
        const override = sanitizeVoice(requested)
        return { type: override.type, voice: override.voice, repeat: override.repeat, rate: override.rate }
    }
    return null
}

export default function sms({ DL }) {
    async function send(phones, message, opts = {}) {
        // backward compat: opts used to be a bare domainId string
        if (!opts || typeof opts !== 'object') opts = typeof opts === 'string' ? { domainId: opts } : {}
        const domainId = opts.domainId || undefined

        let logPromise, log
        // resolve config early for logging (but log even if domainId missing)
        let token, username, source, endpoint, voiceSettings
        let configError = null
        try {
            const cfg = await getSmsConfig(DL, domainId)
            token = cfg.token
            username = cfg.username
            source = cfg.source
            endpoint = cfg.endpoint
            voiceSettings = cfg.voice
        } catch (e) {
            configError = e
            token = ''
            username = ''
            source = 'Shopik'
            endpoint = 'https://019sms.co.il/api'
            voiceSettings = DEFAULT_VOICE
        }

        const tts = resolveTts(opts?.voice, voiceSettings)
        const channel = tts ? 'sms+voice' : 'sms'

        try {
            const logData = {
                action: 'sms',
                direction: DL.Log.constants.DIRECTION.OUT,
                data: {
                    request: {
                        phones,
                        body: message,
                        source,
                        channel,
                        tts: tts || undefined,
                        domainId: domainId || '(missing)',
                        username: username ? `${username.slice(0, 3)}***` : '(missing)'
                    }
                }
            }
            log = DL.Log.start(logData)
            log.actor({ type: DL.Log.constants.ACTOR.API })

            if (configError) throw configError

            if (!Array.isArray(phones) || phones.length === 0) throw new Error('No phones provided')
            if (!message || typeof message !== 'string' || !message.trim()) throw new Error('Empty message')

            const normalized = phones.map(normalizePhone).filter(Boolean)
            if (normalized.length === 0) throw new Error('No valid phones')
            for (const p of normalized) {
                if (!isValidPhone(p)) throw new Error(`Invalid phone: ${p}`)
            }

            if (!token) {
                console.warn('[sms] TOKEN_019 not set for domain', domainId, '— stubbing send', { phones: normalized, message, channel })
                logPromise = log.success({ message: 'stubbed (no TOKEN_019)', phones: normalized, domainId, channel })
                return { stubbed: true, phones: normalized }
            }
            if (!username) {
                const errMsg = `019 SMS username not configured for domain ${domainId} — set sms:019 config (USERNAME_019) for this domain`
                console.error('[sms]', errMsg)
                throw new Error(errMsg)
            }

            const body = buildSmsBody({ username, source, phones: normalized, message, tts })

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 15000)

            let res, text, data
            try {
                res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal
                })
                text = await res.text()
                try { data = JSON.parse(text) } catch { data = { raw: text, httpStatus: res.status } }
            } finally {
                clearTimeout(timeout)
            }

            const status = data?.status
            if (status !== 0 && status !== '0') {
                const msg = data?.message || data?.raw || `HTTP ${res?.status}`
                const err = new Error(`019 SMS failed [${status}]: ${msg}`)
                err.providerResponse = data
                err.providerStatus = status
                throw err
            }

            console.log(`[sms] Sent (${channel}) to ${normalized.join(', ')}: "${message.slice(0, 80)}" → shipment ${data.shipment_id || data.message} [domain:${domainId}]`)
            logPromise = log.success({ message: data.message || 'sent', shipment_id: data.shipment_id, phones: normalized, providerResponse: data, domainId, channel })
            return data
        } catch (error) {
            const errData = {
                message: error?.message || 'error',
                providerResponse: error?.providerResponse,
                providerStatus: error?.providerStatus,
                stack: error?.stack?.slice(0, 2000)
            }
            if (log) logPromise = log.error(errData)
            else {
                try {
                    const fallbackLog = DL.Log.start({ action: 'sms', direction: DL.Log.constants.DIRECTION.OUT, data: { request: { phones, body: message, channel } } })
                    fallbackLog.actor({ type: DL.Log.constants.ACTOR.API })
                    logPromise = fallbackLog.error(errData)
                } catch { }
            }
            throw error
        } finally {
            if (logPromise) await logPromise
        }
    }

    async function otp(phone, code, opts = {}) {
        const domainId = typeof opts === 'string' ? opts : opts?.domainId
        const message = await resolveOtpMessage({ DL, domainId, code })
        return send([phone], message, opts)
    }

    return { send, otp, _normalizePhone: normalizePhone }
}
