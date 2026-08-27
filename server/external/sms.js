const DEFAULT_SOURCE = 'Shopik'

function getToken() {
    return process.env.TOKEN_019 || ''
}

function getUsername() {
    return process.env.USERNAME_019 || ''
}

function getSource() {
    const s = process.env.SMS_SOURCE_019 || DEFAULT_SOURCE
    // 019 source max 11 chars, alphanumeric + letters only
    return String(s).slice(0, 11)
}

function normalizePhone(raw) {
    let d = String(raw).replace(/\D/g, '')
    // handle +972 or 972 prefix → replace with 0
    if (d.startsWith('972')) d = '0' + d.slice(3)
    // if 9 digits starting with 5 → prefix 0 (5xxxxxxxx → 05xxxxxxxx)
    if (d.length === 9 && d.startsWith('5')) d = '0' + d
    return d
}

function isValidPhone(d) {
    // Israeli mobile: 10 digits starting with 05, or 9 digits starting with 5 (before normalization)
    return /^0?5\d{8}$/.test(d)
}

export default function sms({ DL }) {
    async function send(phones, message) {
        const token = getToken()
        const username = getUsername()
        const source = getSource()
        const endpoint = process.env.SMS_API_URL || 'https://019sms.co.il/api'

        let logPromise, log
        try {
            const logData = {
                action: 'sms',
                direction: DL.Log.constants.DIRECTION.OUT,
                data: {
                    request: {
                        phones,
                        body: message,
                        source,
                        username: username ? `${username.slice(0, 3)}***` : '(missing)'
                    }
                }
            }
            log = DL.Log.start(logData)
            log.actor({ type: DL.Log.constants.ACTOR.API })

            // Validation before network call
            if (!Array.isArray(phones) || phones.length === 0) throw new Error('No phones provided')
            if (!message || typeof message !== 'string' || !message.trim()) throw new Error('Empty message')

            const normalized = phones.map(normalizePhone).filter(Boolean)
            if (normalized.length === 0) throw new Error('No valid phones')
            for (const p of normalized) {
                if (!isValidPhone(p)) throw new Error(`Invalid phone: ${p}`)
            }

            if (!token) {
                // Fallback stub behaviour for dev without credentials
                console.warn('[sms] TOKEN_019 not set — stubbing send', { phones: normalized, message })
                logPromise = log.success({ message: 'stubbed (no TOKEN_019)', phones: normalized })
                return { stubbed: true, phones: normalized }
            }
            if (!username) {
                const errMsg = '019 SMS username not configured — set SMS_USERNAME or USERNAME_019 env var (must match TOKEN_019 owner)'
                console.error('[sms]', errMsg)
                throw new Error(errMsg)
            }

            // Build body per https://docs.019sms.co.il/sms/send-sms.html
            // Destinations phone can be string for single or array for multiple (019 accepts both)
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

            // 019 returns { status: 0, message, shipment_id } on success
            const status = data?.status
            if (status !== 0 && status !== '0') {
                const msg = data?.message || data?.raw || `HTTP ${res?.status}`
                const err = new Error(`019 SMS failed [${status}]: ${msg}`)
                err.providerResponse = data
                err.providerStatus = status
                throw err
            }

            console.log(`[sms] Sent to ${normalized.join(', ')}: "${message.slice(0, 80)}" → shipment ${data.shipment_id || data.message}`)
            logPromise = log.success({ message: data.message || 'sent', shipment_id: data.shipment_id, phones: normalized, providerResponse: data })
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
                // If log not started yet, create one
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

    async function otp(phone, code) {
        return send([phone], `Your OTP: ${code}\nValid for 10 minutes`)
    }

    return { send, otp, _normalizePhone: normalizePhone }
}
