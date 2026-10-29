/**
 * Credential + document smoke test for the EZcount integration.
 *
 * Boots the app (so .env and the encrypted Setting are both applied), reports
 * which of the three credential fields are present (never their values), then
 * issues a real 2-line document (one taxable / one exempt) so the auth layer and
 * the mixed-VAT payload can be verified without going through a checkout.
 *
 * Nothing is written to an order; the only side effects are the EZcount document
 * (demo account by default) and one API log row.
 */
import { buildDocPayload, buildPaymentRow, DOC_TYPE } from '#common/functions/invoice/payload.js'
import { getEzcountConfig } from '#server/utils/data/invoice.js'

const DEFAULT_BASE_URL = 'https://api.ezcount.co.il'

function describeSecret(value, source) {
    return value ? `present (${String(value).length} chars, from ${source || 'unknown'})` : 'MISSING'
}

function maskEmail(value) {
    const email = String(value || '')
    if (!email) return 'MISSING'
    const [local, domain] = email.split('@')
    if (!domain) return 'present'
    return `present (${local.slice(0, 1)}***@${domain})`
}

export default async function ezcountCheck(
    { DL, external },
    { domainId, sendEmail = false, note, apiKey, createdByApiKey, developerEmail, baseUrl, noCreatedBy = false, idTransaction, credit = false, parent } = {}
) {
    if (!DL?.Domain) throw new Error('DL required')
    if (!external?.ezcount) throw new Error('external.ezcount not wired')

    const domain = domainId
        ? await DL.Domain.readOne({ id: domainId })
        // eslint-disable-next-line no-underscore-dangle
        : (await DL.Domain.read({}, { _id: 0, id: 1, name: 1 }, { limit: 1 }))?.[0]
    if (!domain?.id) throw new Error('no domain found')

    const config = await getEzcountConfig(DL, domain.id)
    // One-off overrides for credential experiments; never persisted.
    if (apiKey) {
        config.apiKey = apiKey
        config.sources.apiKey = 'cli'
    }
    if (noCreatedBy) {
        config.createdByApiKey = ''
        config.sources.createdByApiKey = 'cli'
    } else if (createdByApiKey) {
        config.createdByApiKey = createdByApiKey
        config.sources.createdByApiKey = 'cli'
    }
    if (developerEmail) {
        config.developerEmail = developerEmail
        config.sources.developerEmail = 'cli'
    }
    if (baseUrl) {
        config.baseUrl = baseUrl
        config.sources.baseUrl = 'cli'
    }
    config.ready = Boolean(config.enabled && config.apiKey && config.developerEmail)
    const resolvedBaseUrl = String(config.baseUrl || process.env.EZCOUNT_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
    const environment = /demo\./i.test(resolvedBaseUrl) ? 'demo' : 'production'

    const report = {
        domain: domain.id,
        name: domain.name,
        baseUrl: resolvedBaseUrl,
        environment,
        enabled: config.enabled,
        autoIssue: config.autoIssue,
        shadowMode: config.shadowMode,
        ready: config.ready,
        credentials: {
            apiKey: describeSecret(config.apiKey, config.sources?.apiKey),
            createdByApiKey: describeSecret(config.createdByApiKey, config.sources?.createdByApiKey),
            developerEmail: `${maskEmail(config.developerEmail)}${config.developerEmail ? `, from ${config.sources?.developerEmail || 'unknown'}` : ''}`
        }
    }
    console.log('[ezcountCheck] config:')
    console.log(JSON.stringify(report, null, 2))

    if (!config.apiKey || !config.developerEmail) {
        console.log('\n[ezcountCheck] cannot call the API: apiKey and developerEmail are required.')
        return { ok: false, error: 'missing apiKey/developerEmail', report }
    }
    if (!config.createdByApiKey) {
        console.log('\n[ezcountCheck] createdByApiKey is not set — distributor accounts will reject this call.')
    } else if (config.createdByApiKey === config.apiKey) {
        // EZcount treats a self-reference as "not provided": the field must be
        // the distributor account's key, which is always a different value.
        console.log('\n[ezcountCheck] createdByApiKey is identical to apiKey — EZcount ignores it and reports it as missing.')
        console.log('[ezcountCheck] It must be the distributor key that created this API key, in the same environment.')
    }

    const stamp = Date.now()
    const payload = buildDocPayload({
        order: { number: `CHECK-${stamp}` },
        docType: credit ? DOC_TYPE.CREDIT : DOC_TYPE.INVOICE,
        customer: {
            name: { first: 'Shopik', last: 'Smoke Test' },
            email: config.developerEmail,
            phone: '0500000000'
        },
        lines: [
            { name: 'בדיקת API - שורה חייבת במע"מ', quantity: 1, gross: 11.9, vat: true },
            { name: 'בדיקת API - שורה פטורה ממע"מ', quantity: 1, gross: 8.1, vat: false }
        ],
        notes: note || `Shopik API check ${new Date().toISOString()}`,
        settings: { language: config.language },
        sendEmail,
        idTransaction: idTransaction || `check:${stamp}`
    })
    // 320 is an invoice *receipt*: EZcount rejects it without a payment row.
    // Card digits are not persisted by our capture flow, so the check uses the
    // neutral "other" type, exactly like the production builder does.
    if (!credit) payload.payment = [buildPaymentRow({ amount: payload.price_total, settings: config })]
    if (credit && parent) payload.parent = parent

    console.log(`\n[ezcountCheck] sending type ${credit ? '330 (credit)' : '320 (invoice receipt)'}, 2 lines (INC 11.90 + NON 8.10), dont_send_email =`, !sendEmail)
    const result = await external.ezcount.createDoc({ config, payload })

    console.log('[ezcountCheck] result:')
    console.log(JSON.stringify(result, null, 2))
    return result
}
