const CCODE_MESSAGES = {
    0: 'Success',
    700: 'Authorized (J5 hold)',
    800: 'Postponed success',
    33: 'Refund exceeds original amount',
    920: 'Already transmitted — cannot cancel, refund instead',
    777: 'Reversal success'
}

// Hyp Brand param (numeric index) → card company name
const CARD_COMPANIES = ['PL', 'MasterCard', 'Visa', 'Maestro', '', 'Isracard']

function getConfig() {
    const masof = process.env.HYP_MASOF
    const key = process.env.HYP_KEY
    const passp = process.env.HYP_PASSP
    const baseUrl = process.env.HYP_BASE_URL || 'https://pay.hyp.co.il/p/'
    if (!masof || !key || !passp) throw { status: 500, message: 'Hyp credentials not configured' }
    return { masof, key, passp, baseUrl: baseUrl.endsWith('/') ? baseUrl : baseUrl + '/' }
}

function parseHypResponse(text) {
    const params = new URLSearchParams(text.trim())
    const obj = {}
    for (const [k, v] of params.entries()) obj[k] = v
    if (obj.CCode !== undefined) obj.CCode = Number(obj.CCode)
    if (obj.Amount !== undefined) obj.Amount = Number(obj.Amount)
    return obj
}

async function hypFetch(url, { timeoutMs = 15000 } = {}) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const res = await fetch(url, { signal: controller.signal })
        const text = await res.text()
        return text
    } finally {
        clearTimeout(t)
    }
}

function buildSignQuery({ masof, key, passp, amount, orderNumber, orderId, customer, sendInvoiceEmail, tmp }) {
    const params = new URLSearchParams()
    params.set('action', 'APISign')
    params.set('What', 'SIGN')
    params.set('Sign', 'True')
    params.set('UTF8', 'True')
    params.set('UTF8out', 'True')
    params.set('Masof', masof)
    params.set('KEY', key)
    params.set('PassP', passp)
    params.set('Amount', String(amount))
    params.set('Order', String(orderNumber))
    params.set('J5', 'True')
    params.set('MoreData', 'True')
    params.set('Coin', '1')
    params.set('tmp', tmp)
    params.set('Tash', 1)
    if (orderId) params.set('Info', String(orderId))
    if (customer?.name?.first) params.set('ClientName', customer.name.first)
    if (customer?.name?.last) params.set('ClientLName', customer.name.last)
    if (customer?.phone) {
        const digits = String(customer.phone).replace(/\D/g, '')
        params.set('phone', digits)
        params.set('Cell', digits)
    }
    if (customer?.idNum) params.set('UserId', customer.idNum)
    if (customer?.email) {
        params.set('email', customer.email)
        if (sendInvoiceEmail) params.set('SendHesh', 'True')
    }
    return params.toString()
}

export default function hypFactory({ DL }) {
    async function createPaymentUrl({ order, amount, customer }) {
        const { masof, key, passp, baseUrl } = getConfig()
        const query = buildSignQuery({
            masof, key, passp,
            amount,
            orderNumber: order.number,
            orderId: order.id,
            customer: customer || { name: order.name, phone: order.phone, email: order.email },
            tmp: 6,
            sendInvoiceEmail: Boolean(order.email)
        })
        const text = await hypFetch(`${baseUrl}?${query}`)
        if (!text || text.includes('CCode') && text.includes('CCode=')) {
            // Some error responses are still query strings with CCode !=0
            const parsed = parseHypResponse(text)
            if (parsed.CCode && parsed.CCode !== 0) {
                throw { status: 502, message: `Hyp SIGN failed: ${CCODE_MESSAGES[parsed.CCode] || parsed.CCode}`, providerCode: parsed.CCode, raw: parsed }
            }
        }
        // Success: text is signed param string
        const trimmed = text.trim()
        return `${baseUrl}?${trimmed}`
    }

    async function verifyRedirect({ query, rawQueryString }) {
        const { masof, key, passp, baseUrl } = getConfig()
        // Preserve original param order: use rawQueryString if provided, else build from query
        let redirectPart = rawQueryString || new URLSearchParams(query).toString()
        // hyp expects all redirect params appended after Masof/KEY/PassP in original order
        const verifyQuery = `action=APISign&What=VERIFY&Masof=${encodeURIComponent(masof)}&KEY=${encodeURIComponent(key)}&PassP=${encodeURIComponent(passp)}&${redirectPart}`
        const text = await hypFetch(`${baseUrl}?${verifyQuery}`)
        const parsed = parseHypResponse(text)
        return parsed // CCode=0 means valid
    }

    async function getToken(providerTxnId) {
        const { masof, passp, baseUrl } = getConfig()
        const params = new URLSearchParams({ action: 'getToken', Masof: masof, PassP: passp, TransId: String(providerTxnId) })
        const text = await hypFetch(`${baseUrl}?${params.toString()}`)
        const parsed = parseHypResponse(text)
        return parsed // { Token, Tokef, CCode }
    }

    async function capture({ order, amount }) {
        const { masof, passp, baseUrl } = getConfig()
        const p = order.payment || {}
        const captureAmount = amount ?? order.finalSumWithShippingAndHandling
        const authorizedAmount = p.authorizedAmount
        if (!p.cardToken || !p.cardExpiry) throw { status: 400, message: 'Missing card token for capture' }
        if (!p.authCode) throw { status: 400, message: 'Missing authCode for capture' }
        const tokef = String(p.cardExpiry)
        const tmonth = tokef.slice(0, 2)
        const tyear = tokef.slice(2)
        const payerId = p.providerPayerId || '000000000'
        const clientName = `${order.name?.first || ''} ${order.name?.last || ''}`.trim() || 'Customer'
        const originalAmountAgorot = Math.round(Number(authorizedAmount) * 100)
        const providerUid = p.providerUid

        const params = new URLSearchParams()
        params.set('action', 'soft')
        params.set('Masof', masof)
        params.set('PassP', passp)
        params.set('UserId', payerId)
        params.set('ClientName', clientName)
        params.set('Token', 'True')
        params.set('CC', p.cardToken)
        params.set('Tmonth', tmonth)
        params.set('Tyear', tyear)
        params.set('AuthNum', p.authCode)
        params.set('Amount', String(captureAmount))
        params.set('inputObj.originalAmount', String(originalAmountAgorot))
        params.set('inputObj.originalUid', String(providerUid || ''))
        params.set('inputObj.authorizationCodeManpik', '7')
        if (order.id) params.set('Info', order.id)

        const text = await hypFetch(`${baseUrl}?${params.toString()}`)
        const parsed = parseHypResponse(text)
        return parsed // { Id, CCode, ... }
    }

    async function captureOverCaptureSplit({ order, captureAmount }) {
        // fallback when J4 > authorized and over-capture not allowed: capture max + token charge remainder
        const authorized = order.payment.authorizedAmount
        const overflow = Number((captureAmount - authorized).toFixed(2))
        if (overflow <= 0) return { primary: await capture({ order, amount: captureAmount }) }
        const primary = await capture({ order, amount: authorized })
        if (primary.CCode !== 0) return { primary }
        // second immediate charge for overflow (no originalUid/originalAmount refs)
        const { masof, passp, baseUrl } = getConfig()
        const p = order.payment
        const tokef = String(p.cardExpiry)
        const tmonth = tokef.slice(0, 2)
        const tyear = tokef.slice(2)
        const payerId = p.providerPayerId || '000000000'
        const clientName = `${order.name?.first || ''} ${order.name?.last || ''}`.trim() || 'Customer'
        const params = new URLSearchParams()
        params.set('action', 'soft')
        params.set('Masof', masof)
        params.set('PassP', passp)
        params.set('UserId', payerId)
        params.set('ClientName', clientName)
        params.set('Token', 'True')
        params.set('CC', p.cardToken)
        params.set('Tmonth', tmonth)
        params.set('Tyear', tyear)
        params.set('Amount', String(overflow))
        if (order.id) params.set('Info', order.id)
        const text = await hypFetch(`${baseUrl}?${params.toString()}`)
        const secondary = parseHypResponse(text)
        return { primary, secondary, overflow }
    }

    async function refund({ providerTxnId, amount }) {
        const { masof, passp, baseUrl } = getConfig()
        const params = new URLSearchParams({ action: 'zikoyAPI', Masof: masof, PassP: passp, TransId: String(providerTxnId), Amount: String(amount) })
        const text = await hypFetch(`${baseUrl}?${params.toString()}`)
        const parsed = parseHypResponse(text)
        return parsed // { Id (new), CCode }
    }

    async function cancel({ providerTxnId }) {
        const { masof, passp, baseUrl } = getConfig()
        const params = new URLSearchParams({ action: 'CancelTrans', Masof: masof, PassP: passp, TransId: String(providerTxnId) })
        const text = await hypFetch(`${baseUrl}?${params.toString()}`)
        const parsed = parseHypResponse(text)
        return parsed // { ReversalStatus, CCode }
    }

    async function invoiceLink(providerTxnId) {
        const { masof, key, passp, baseUrl } = getConfig()
        const params = new URLSearchParams({ action: 'APISign', What: 'SIGN', Masof: masof, KEY: key, PassP: passp, TransId: String(providerTxnId), type: 'EZCOUNT', ACTION: 'PrintHesh' })
        const text = await hypFetch(`${baseUrl}?${params.toString()}`)
        const trimmed = text.trim()
        if (!trimmed || trimmed.includes('CCode') && trimmed.includes('Error')) {
            const parsed = parseHypResponse(trimmed)
            if (parsed.CCode && parsed.CCode !== 0) throw { status: 502, message: `PrintHesh failed: ${CCODE_MESSAGES[parsed.CCode] || parsed.CCode}`, providerCode: parsed.CCode }
        }
        return `${baseUrl}?${trimmed}`
    }

    function ccodeMessage(code) {
        return CCODE_MESSAGES[code] || `Hyp error ${code}`
    }

    function cardBrandName(brand) {
        const idx = Number(brand)
        if (Number.isNaN(idx)) return undefined
        return CARD_COMPANIES[idx] || undefined
    }

    return {
        getConfig,
        parseHypResponse,
        createPaymentUrl,
        verifyRedirect,
        getToken,
        capture,
        captureOverCaptureSplit,
        refund,
        cancel,
        invoiceLink,
        ccodeMessage,
        cardBrandName
    }
}
