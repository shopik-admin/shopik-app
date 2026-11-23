// Shared translation constants. The base language is backed by
// common/texts/hebrew.json; every other language is stored in MongoDB.
export const BASE_LANGUAGE_CODE = 'he'

export const BASE_LANGUAGE = Object.freeze({
    code: BASE_LANGUAGE_CODE,
    name: 'hebrew',
    nativeName: 'עברית',
    direction: 'rtl',
    flag: ''
})

export const LANGUAGE_DIRECTIONS = ['rtl', 'ltr']

export const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i

export function normalizeLanguageCode(code) {
    return typeof code === 'string' ? code.trim().toLowerCase() : ''
}

export function isValidLanguageCode(code) {
    return LANGUAGE_CODE_PATTERN.test(code || '')
}
