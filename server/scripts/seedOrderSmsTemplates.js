/**
 * Seed order + OTP SMS templates (idempotent, safe to re-run).
 * Usage:
 *   node server/scripts/runSeed.js seedOrderSmsTemplates
 *   node server/scripts/runSeed.js seedOrderSmsTemplates <domainId>
 *
 * Creates only missing settings and never overwrites edited templates.
 * Order templates are stored hidden under category 'notifications' /
 * subCategory 'order-sms', the OTP template under 'notifications' / 'otp-sms',
 * so only the admin SMS Templates page manages them per domain.
 */
import {
    DEFAULT_ORDER_SMS_TEMPLATES,
    ORDER_SMS_CATEGORY,
    ORDER_SMS_METHODS,
    ORDER_SMS_SUB_CATEGORY,
    ORDER_SMS_TEMPLATE_KEYS
} from '#common/constants/orderSms.js'
import {
    DEFAULT_OTP_SMS_TEMPLATE,
    OTP_SMS_CATEGORY,
    OTP_SMS_SETTING_KEY,
    OTP_SMS_SUB_CATEGORY
} from '#common/constants/otpSms.js'

export default async function seedOrderSmsTemplates({ DL }) {
    const domainFilter = process.argv[3]
    const domains = await DL.Domain.read(
        domainFilter ? { id: domainFilter } : {},
        { _id: 0, id: 1, name: 1 },
        { limit: 0 }
    )
    if (!domains?.length) {
        console.log('[orderSmsTemplates] no domains found, nothing to seed')
        return
    }

    let created = 0
    for (const domain of domains) {
        for (const method of ORDER_SMS_METHODS) {
            for (const [stage, key] of Object.entries(ORDER_SMS_TEMPLATE_KEYS[method.key])) {
                const existing = await DL.Setting.readOne({ domainId: domain.id, key })
                if (existing) {
                    if (!existing.hidden)
                        await DL.Setting.updateOne({ id: existing.id }, { hidden: true })
                    continue
                }
                await DL.Setting.create({
                    key,
                    value: DEFAULT_ORDER_SMS_TEMPLATES[method.key][stage],
                    domainId: domain.id,
                    category: ORDER_SMS_CATEGORY,
                    subCategory: ORDER_SMS_SUB_CATEGORY,
                    formType: 'textarea',
                    renderType: 'string',
                    public: false,
                    hidden: true
                })
                created++
            }
        }

        const existingOtp = await DL.Setting.readOne({ domainId: domain.id, key: OTP_SMS_SETTING_KEY })
        if (!existingOtp) {
            await DL.Setting.create({
                key: OTP_SMS_SETTING_KEY,
                value: DEFAULT_OTP_SMS_TEMPLATE,
                domainId: domain.id,
                category: OTP_SMS_CATEGORY,
                subCategory: OTP_SMS_SUB_CATEGORY,
                formType: 'textarea',
                renderType: 'string',
                public: false,
                hidden: true
            })
            created++
        } else if (!existingOtp.hidden) {
            await DL.Setting.updateOne({ id: existingOtp.id }, { hidden: true })
        }
        console.log(`[orderSmsTemplates] domain ${domain.id} ready`)
    }
    console.log(`[orderSmsTemplates] Done - ${created} created, rest already existed`)
}
