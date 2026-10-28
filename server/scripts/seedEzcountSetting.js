/**
 * Seed the per-domain EZcount Setting (encrypted at rest by the Setting model).
 *
 * Usage: node server/scripts/runSeedEzcountSetting.js
 *          [--domain <domainId>] [--enabled true] [--shadow true|false]
 *          [--api-key <key>] [--created-by-api-key <key>]
 *          [--developer-email <email>] [--base-url <url>]
 *          [--crn-threshold <amount>]
 *
 * Distributor accounts must also pass --created-by-api-key (or set
 * EZCOUNT_CREATED_BY_API_KEY); ordinary accounts leave it unset.
 *
 * Credentials can also come from EZCOUNT_API_KEY / EZCOUNT_CREATED_BY_API_KEY /
 * EZCOUNT_DEVELOPER_EMAIL / EZCOUNT_BASE_URL. The script never prints the key
 * back.
 *
 * Only explicitly supplied keys are written: re-running it to flip `enabled`
 * or `shadowMode` after go-live never wipes the stored credentials or the
 * accountant's thresholds.
 */
import { DEFAULT_SETTINGS } from '#server/utils/data/invoice.js'
import log from '#server/utils/log.js'

function parseBool(value) {
    if (value === undefined || value === null || value === '') return undefined
    return String(value).toLowerCase() === 'true'
}

export default async function seedEzcountSetting(
    { DL } = {},
    { domainId, enabled, apiKey, createdByApiKey, developerEmail, baseUrl, shadowMode, crnThreshold } = {}
) {
    if (!DL?.Setting) throw new Error('DL required')

    const domains = domainId
        ? [await DL.Domain.readOne({ id: domainId })]
        : await DL.Domain.read({}, { _id: 0, id: 1, name: 1 }, { limit: 0 })

    const list = (domains || []).filter(d => d?.id)
    if (!list.length) throw new Error('no domain found')

    const overrides = {}
    const key = apiKey || process.env.EZCOUNT_API_KEY
    const createdBy = createdByApiKey || process.env.EZCOUNT_CREATED_BY_API_KEY
    const email = developerEmail || process.env.EZCOUNT_DEVELOPER_EMAIL
    const url = baseUrl || process.env.EZCOUNT_BASE_URL
    if (key) overrides.apiKey = key
    if (createdBy) overrides.createdByApiKey = createdBy
    if (email) overrides.developerEmail = email
    if (url) overrides.baseUrl = url
    if (enabled !== undefined) overrides.enabled = parseBool(enabled)
    if (shadowMode !== undefined) overrides.shadowMode = parseBool(shadowMode)
    if (crnThreshold !== undefined && crnThreshold !== true && !Number.isNaN(Number(crnThreshold)))
        overrides.crnThreshold = Number(crnThreshold)

    const results = []
    for (const domain of list) {
        const existing = await DL.Setting.readOne({ key: 'ezcount', domainId: domain.id })
        if (existing?.id) {
            await DL.Setting.updateOne(
                { id: existing.id },
                { value: { ...(existing.value || {}), ...overrides }, hidden: true }
            )
            results.push({ domainId: domain.id, action: 'updated' })
        } else {
            await DL.Setting.create({
                key: 'ezcount',
                category: 'integrations',
                subCategory: 'ezcount',
                domainId: domain.id,
                formType: 'config',
                hidden: true,
                public: false,
                value: { ...DEFAULT_SETTINGS, ...overrides }
            })
            results.push({ domainId: domain.id, action: 'created' })
        }
    }

    log.success(`[seedEzcountSetting] ${results.map(r => `${r.domainId}:${r.action}`).join(', ')}`)
    return results
}
