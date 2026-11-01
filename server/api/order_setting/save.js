import { GLOBAL_SETTINGS_DOMAIN, PRODUCT_RULES_SETTING_KEY } from '#common/constants.js'
import { normalizeRules } from '#common/functions/productRules.js'
import { getOrderSettings } from './read.js'

// Same `orders` bucket as the storefront's `limits` row so both live together
// in the settings collection, but the global row is stored under the reserved
// `__global__` domain and hidden from the generic settings UI (it has its own
// dedicated page).
const SETTINGS_CATEGORY = 'orders'
const LIMITS_KEY = 'limits'

export default async function save({ domainId, rules, limits }, { DL }) {
    if (rules !== undefined) {
        const normalized = normalizeRules(rules)
        await DL.Setting.updateOne(
            { key: PRODUCT_RULES_SETTING_KEY, domainId: GLOBAL_SETTINGS_DOMAIN },
            {
                $set: { value: normalized },
                $setOnInsert: {
                    key: PRODUCT_RULES_SETTING_KEY,
                    domainId: GLOBAL_SETTINGS_DOMAIN,
                    category: SETTINGS_CATEGORY,
                    subCategory: 'product_rules',
                    formType: 'config',
                    renderType: 'config',
                    public: false,
                    hidden: true
                }
            },
            { upsert: true, runValidators: true }
        )
    }

    if (domainId && limits !== undefined) {
        const domain = await DL.Domain.readById(domainId)
        if (!domain)
            throw { status: 400, message: 'invalid domain id' }

        // Merge so keys the storefront reads but this page does not edit are
        // preserved on save.
        const current = await DL.Setting.readOne({ key: LIMITS_KEY, domainId }, { _id: 0, value: 1 })
        const value = { ...(current?.value || {}), ...limits }

        await DL.Setting.updateOne(
            { key: LIMITS_KEY, domainId },
            {
                $set: { value },
                $setOnInsert: {
                    key: LIMITS_KEY,
                    domainId,
                    category: SETTINGS_CATEGORY,
                    subCategory: 'limits',
                    formType: 'config',
                    renderType: 'config',
                    public: false,
                    hidden: true
                }
            },
            { upsert: true, runValidators: true }
        )
    }

    return getOrderSettings(DL, domainId)
}

save.config = {
    permissions: ['setting:update']
}
