import { isValidLanguageCode, normalizeLanguageCode } from '#common/constants/translations.js'

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_KEY_LENGTH = 200
const MAX_VALUE_LENGTH = 10000

export function languageCode(value) {
    const code = normalizeLanguageCode(value)
    if (!code || !isValidLanguageCode(code))
        throw { status: 400, message: 'invalid language code' }
    return code
}

export function translationKey(value) {
    if (typeof value !== 'string')
        throw { status: 400, message: 'key must be a string' }

    const key = value.trim()
    if (!key)
        throw { status: 400, message: 'key is required' }
    if (key.length > MAX_KEY_LENGTH)
        throw { status: 400, message: `key is longer than ${MAX_KEY_LENGTH} characters` }
    if (RESERVED_KEYS.has(key))
        throw { status: 400, message: 'reserved key' }
    if (/[\u0000-\u001f\u007f]/.test(key))
        throw { status: 400, message: 'key contains control characters' }

    return key
}

export function translationValue(value) {
    if (typeof value !== 'string')
        throw { status: 400, message: 'value must be a string' }
    if (!value.trim())
        throw { status: 400, message: 'value is required' }
    if (value.length > MAX_VALUE_LENGTH)
        throw { status: 400, message: `value is longer than ${MAX_VALUE_LENGTH} characters` }
    if (value.includes('\u0000'))
        throw { status: 400, message: 'value contains a null character' }

    return value
}

export function direction(value) {
    return value === 'ltr' ? 'ltr' : 'rtl'
}

export { MAX_VALUE_LENGTH }
