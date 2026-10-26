// Production document API. Official SDK docs: `https://api.ezcount.co.il` for
// production and `https://demo.ezcount.co.il` for the demo account (separate
// API key). `www.ezcount.co.il` also answers, but the dedicated API host is the
// documented one. Override per domain via Setting.baseUrl / EZCOUNT_BASE_URL.
const DEFAULT_BASE_URL = 'https://api.ezcount.co.il'
const DEFAULT_TIMEOUT_MS = 35000
const REDACTED = '***'

// Never let credentials reach the logs or the database. EZcount echoes the
// caller's API key back inside `errMsg` on auth failures, and failure responses
// are persisted on the order (`invoice.response`), so error bodies need the
// same scrubbing as requests.
const SECRET_KEY_RE = /^(api_key|created_by_api_key|developer_email|apikey|password|token|authorization)$/i
const MESSAGE_KEY_RE = /^(errmsg|errmsgpretty|error|message|errormessage|error_description|raw)$/i
const HEX_SECRET_RE = /\b[a-f0-9]{48,}\b/gi

// Provider messages are accurate but not always actionable; append a short
// hint for the two failures that are configuration, not code, problems.
const PROVIDER_HINTS = [
    [/created_by_api_key/i, 'this account is a distributor: also send the distributor key (created_by_api_key)'],
    [/not correct for the environment/i, 'the API key belongs to a different environment: demo and production keys are not interchangeable']
]

function secretList(secrets) {
    if (!secrets) return []
    return (Array.isArray(secrets) ? secrets : [secrets])
        .map(value => (value == null ? '' : String(value)))
        .filter(value => value.length >= 8)
}

function scrubString(text, secrets, { hex = false } = {}) {
    let out = String(text)
    for (const secret of secretList(secrets)) out = out.split(secret).join(REDACTED)
    return hex ? out.replace(HEX_SECRET_RE, REDACTED) : out
}

/**
 * Deep-copy `value`, masking secret-looking keys and any configured secret
 * (or long hex token, when `hex` is set) found inside strings.
 */
export function scrubSecrets(value, secrets, { hex = false } = {}) {
    if (typeof value === 'string') return scrubString(value, secrets, { hex })
    if (Array.isArray(value)) return value.map(item => scrubSecrets(item, secrets, { hex }))
    if (value && typeof value === 'object') {
        const out = {}
        for (const [key, entry] of Object.entries(value)) {
            if (SECRET_KEY_RE.test(key)) out[key] = REDACTED
            else out[key] = scrubSecrets(entry, secrets, { hex: hex || MESSAGE_KEY_RE.test(key) })
        }
        return out
    }
    return value
}

// Logs get the aggressive variant: any 48+ char hex token is masked too.
function redact(value, secrets) {
    return scrubSecrets(value, secrets, { hex: true })
}

function firstDefined(source, keys) {
    if (!source || typeof source !== 'object') return undefined
    for (const key of keys) {
        const value = source[key]
        if (value !== undefined && value !== null && value !== '') return value
    }
    return undefined
}

/**
 * Normalize an EZcount response. Success is
 * `{ success, doc_number, doc_uuid, pdf_link, sent_mails }`. Failures arrive
 * with HTTP 200 and `{ success: false, errNum, errMsg, errMsgPretty }`, which
 * is why the HTTP status alone says nothing — `success === false` wins even
 * when a document number is present.
 */
export function normalizeDocResponse(raw, httpStatus) {
    const source = raw && typeof raw === 'object' ? raw : {}
    const docNumber = firstDefined(source, ['doc_number', 'InvoiceNumber', 'docNumber', 'document_number'])
    const docId = firstDefined(source, ['doc_uuid', 'doc_id', 'document_id', 'docId'])
    const docUrl = firstDefined(source, ['pdf_link', 'InvoiceLink', 'doc_url', 'document_url', 'docUrl'])
    const pretty = Array.isArray(source.errMsgPretty)
        ? source.errMsgPretty.filter(v => typeof v === 'string' && v.trim()).join(' ')
        : undefined
    const providerError = firstDefined(source, ['errMsg', 'InvoiceError', 'error', 'message', 'error_message']) ?? pretty
    const providerCode = firstDefined(source, ['errNum', 'err_num', 'error_code', 'code'])
    const explicitlyFailed = source.success === false
    const success = source.success === true || source.InvoiceStatus === 'OK' || source.status === 'success'
    const ok = Boolean(!explicitlyFailed && (success || (docNumber != null && providerError == null)))
    const errorText = String(providerError ?? `EZcount request failed${httpStatus ? ` (HTTP ${httpStatus})` : ''}`)
    const hint = ok ? undefined : PROVIDER_HINTS.find(([re]) => re.test(errorText))?.[1]
    return {
        ok,
        httpStatus,
        code: ok ? undefined : (providerCode != null ? `EZCOUNT_ERROR_${providerCode}` : 'EZCOUNT_REJECTED'),
        providerCode: providerCode ?? undefined,
        docId: docId != null ? String(docId) : undefined,
        docNumber: docNumber != null ? String(docNumber) : undefined,
        docUrl: docUrl != null ? String(docUrl) : undefined,
        error: ok ? undefined : (hint ? `${errorText} (${hint})` : errorText),
        raw: raw ?? null
    }
}

export default function ezcountFactory({ DL }) {
    async function logged(name, request, fn, secrets = []) {
        let logger = null
        try {
            logger = DL?.Log?.start?.({
                action: `ezcount:${name}`,
                direction: DL?.Log?.constants?.DIRECTION?.OUT || 'out',
                data: { request: redact(request, secrets) }
            })
            try { logger?.actor?.({ type: DL?.Log?.constants?.ACTOR?.API || 'api' }) } catch { }
        } catch { logger = null }
        const done = async (ok, payload) => {
            try { await logger?.[ok ? 'success' : 'error']?.(redact(payload, secrets)) } catch { }
        }
        try {
            const result = await fn()
            await done(result?.ok !== false, result)
            return result
        } catch (error) {
            await done(false, { error: error?.message || String(error) })
            throw error
        }
    }

    async function post(path, body, { baseUrl, timeoutMs } = {}) {
        const base = String(baseUrl || process.env.EZCOUNT_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
        const url = `${base}${path}`
        const timeout = Number(timeoutMs || process.env.EZCOUNT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeout)
        let response
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            })
        } catch (error) {
            const err = new Error(
                error?.name === 'AbortError'
                    ? `EZcount timeout after ${timeout}ms`
                    : `EZcount request failed: ${error?.message || error}`
            )
            err.code = 'EZCOUNT_REQUEST_FAILED'
            err.status = 502
            // A timeout is deliberately not a failure: the document may exist.
            err.timeout = error?.name === 'AbortError'
            throw err
        } finally {
            clearTimeout(timer)
        }

        const text = await response.text().catch(() => '')
        let raw = null
        try { raw = text ? JSON.parse(text) : null } catch { raw = { raw: text } }
        return normalizeDocResponse(raw, response.status)
    }

    /**
     * Create a document. `payload` is the pure document body built by
     * common/functions/invoice/payload.js; credentials are added here.
     *
     * `id_transaction` is sent by the caller and is EZcount's own dedupe key:
     * repeating a request with the same id returns the existing document
     * instead of creating a second one.
     *
     * Distributor accounts also require `created_by_api_key`; it is only sent
     * when configured so ordinary accounts are unaffected.
     */
    async function createDoc({ config = {}, payload = {} } = {}) {
        const apiKey = config.apiKey || process.env.EZCOUNT_API_KEY
        const createdByApiKey = config.createdByApiKey || process.env.EZCOUNT_CREATED_BY_API_KEY
        const developerEmail = config.developerEmail || process.env.EZCOUNT_DEVELOPER_EMAIL
        const secrets = [apiKey, createdByApiKey, developerEmail]
        const body = {
            api_key: apiKey,
            created_by_api_key: apiKey,
            developer_email: developerEmail,
            ...payload
        }
        if (createdByApiKey) body.created_by_api_key = createdByApiKey
        const result = await logged('createDoc', body, () => post('/api/createDoc', body, {
            baseUrl: config.baseUrl,
            timeoutMs: config.timeoutMs
        }), secrets)
        // The raw body is persisted with the invoice; strip echoed credentials
        // before it can reach Mongo, the admin UI or a log line.
        return scrubSecrets(result, secrets)
    }

    return { createDoc }
}
