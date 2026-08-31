import { getSmsConfig } from './config.js'

function normalizePhone(raw) {
    let d = String(raw).replace(/\D/g, '')
    if (d.startsWith('972')) d = '0' + d.slice(3)
    if (d.length === 9 && d.startsWith('5')) d = '0' + d
    return d
}

function isValidPhone(d) {
    return /^0?5\d{8}$/.test(d)
}

export default function sms({ DL }) {
    async function send(phones, message, opts = {}) {
        let domainId = opts.domainId || (typeof opts === 'string' ? opts : undefined)
        // also allow opts as string for backward compat
        if (!domainId && opts && typeof opts === 'object' && opts.domainId) domainId = opts.domainId

        let logPromise, log
        // resolve config early for logging (but log even if domainId missing)
        let token, username, source, endpoint
        let configError = null
        try {
            const cfg = await getSmsConfig(DL, domainId)
            token = cfg.token
            username = cfg.username
            source = cfg.source
            endpoint = cfg.endpoint
        } catch (e) {
            configError = e
            token = ''
            username = ''
            source = 'Shopik'
            endpoint = 'https://019sms.co.il/api'
        }

        try {
            const logData = {
                action: 'sms',
                direction: DL.Log.constants.DIRECTION.OUT,
                data: {
                    request: {
                        phones,
                        body: message,
                        source,
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
                console.warn('[sms] TOKEN_019 not set for domain', domainId, '— stubbing send', { phones: normalized, message })
                logPromise = log.success({ message: 'stubbed (no TOKEN_019)', phones: normalized, domainId })
                return { stubbed: true, phones: normalized }
            }
            if (!username) {
                const errMsg = `019 SMS username not configured for domain ${domainId} — set sms:019 config (USERNAME_019) for this domain`
                console.error('[sms]', errMsg)
                throw new Error(errMsg)
            }

            const phoneField = normalized.length === 1 ? normalized[0] : normalized
            const body = {
                sms: {
                    user: { username },
                    source,
                    destinations: { phone: phoneField },
                    message
                }
            }

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

            console.log(`[sms] Sent to ${normalized.join(', ')}: "${message.slice(0, 80)}" → shipment ${data.shipment_id || data.message} [domain:${domainId}]`)
            logPromise = log.success({ message: data.message || 'sent', shipment_id: data.shipment_id, phones: normalized, providerResponse: data, domainId })
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
                    const fallbackLog = DL.Log.start({ action: 'sms', direction: DL.Log.constants.DIRECTION.OUT, data: { request: { phones, body: message } } })
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
        return send([phone], `Your OTP: ${code}\nValid for 10 minutes`, opts)
    }

    return { send, otp, _normalizePhone: normalizePhone }
}
