import { GLOBAL_SETTINGS_DOMAIN, PRODUCT_RULES_SETTING_KEY } from '#common/constants.js'
import { normalizeRules } from '#common/functions/productRules.js'

// Product rules are global (one catalog for every domain). Domain `limits`
// stay per domain and are only read when a domainId is requested.
export async function getOrderSettings(DL, domainId) {
    const [rulesSetting, limitsSetting] = await Promise.all([
        DL.Setting.readOne(
            { key: PRODUCT_RULES_SETTING_KEY, domainId: GLOBAL_SETTINGS_DOMAIN },
            { _id: 0, value: 1 }
        ),
        domainId
            ? DL.Setting.readOne({ key: 'limits', domainId }, { _id: 0, value: 1 })
            : Promise.resolve(null)
    ])

    return {
        rules: normalizeRules(rulesSetting?.value),
        limits: limitsSetting?.value && typeof limitsSetting.value === 'object'
            ? limitsSetting.value
            : {}
    }
}

export default async function read({ domainId } = {}, { DL }) {
    return getOrderSettings(DL, domainId)
}

read.config = {
    permissions: ['setting:read']
}
