import {
    DEFAULT_OTP_SMS_TEMPLATE,
    OTP_SMS_SETTING_KEY
} from '#common/constants/otpSms.js'
import renderSmsTemplate from '#common/functions/renderSmsTemplate.js'

/**
 * Space-separated digits so the TTS engine reads the code one digit at a time
 * instead of as one big number.
 */
export function spaceDigits(code) {
    return String(code ?? '').replace(/\D/g, '').split('').join(' ')
}

export function buildOtpMessage(code, template) {
    const source = typeof template === 'string' && template.trim()
        ? template
        : DEFAULT_OTP_SMS_TEMPLATE
    return renderSmsTemplate(source, { code: spaceDigits(code) })
}

/**
 * Per-domain OTP template (`otp_sms_template` setting), falling back to the
 * built-in default when the domain has none or the lookup fails.
 */
export async function resolveOtpMessage({ DL, domainId, code } = {}) {
    let template = null
    if (domainId && DL?.Setting) {
        const setting = await DL.Setting.readOne({ domainId, key: OTP_SMS_SETTING_KEY }).catch(() => null)
        if (typeof setting?.value === 'string') template = setting.value
    }
    return buildOtpMessage(code, template)
}
