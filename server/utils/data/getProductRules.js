import { GLOBAL_SETTINGS_DOMAIN, PRODUCT_RULES_SETTING_KEY } from '#common/constants.js'
import { normalizeRules } from '#common/functions/productRules.js'

// Rules are global: the catalog is shared by every domain, so a cap or step
// configured once must apply everywhere. They live in `settings` under a
// reserved domain instead of being copied into each domain's `limits` row.
export default async function getProductRules(DL) {
    if (!DL?.Setting?.readOne) return normalizeRules(null)
    try {
        const setting = await DL.Setting.readOne(
            { key: PRODUCT_RULES_SETTING_KEY, domainId: GLOBAL_SETTINGS_DOMAIN },
            { _id: 0, value: 1 }
        )
        return normalizeRules(setting?.value)
    } catch {
        // A broken rules read must not take the storefront down. Callers treat
        // this as "no rules"; the next request retries.
        return normalizeRules(null)
    }
}

export { GLOBAL_SETTINGS_DOMAIN, PRODUCT_RULES_SETTING_KEY }
