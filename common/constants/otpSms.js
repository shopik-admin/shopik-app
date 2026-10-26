export const OTP_SMS_CATEGORY = 'notifications'
export const OTP_SMS_SUB_CATEGORY = 'otp-sms'
export const OTP_SMS_SETTING_KEY = 'otp_sms_template'

export const OTP_SMS_VARIABLES = [
    { key: 'code', label: 'Verification code (read digit by digit)' }
]

/**
 * Single message for both channels: 019 uses it as the SMS body for regular
 * phones and as the spoken text for kosher phones.
 * {{code}} is rendered as space-separated digits so TTS reads them one by one.
 */
export const DEFAULT_OTP_SMS_TEMPLATE =
    'קוד האימות שלך הוא {{code}}. הקוד תקף ל-10 דקות.'

// SMS length limits (UCS-2, Hebrew): 70 chars in one message, 67 per part when
// concatenated. Used for the admin editor counter only.
export const OTP_SMS_SINGLE_SEGMENT_CHARS = 70
export const OTP_SMS_MULTI_SEGMENT_CHARS = 67

export function otpSmsSegments(text) {
    const length = String(text ?? '').length
    if (length <= OTP_SMS_SINGLE_SEGMENT_CHARS) return 1
    return Math.ceil(length / OTP_SMS_MULTI_SEGMENT_CHARS)
}
