import hebrewTexts from './hebrew.json' with { type: 'json' }

const baseTexts = hebrewTexts.texts || {}

/**
 * Runtime translation layers.
 *
 * `texts`    - overrides for the active language
 * `fallback` - Hebrew overrides (used when the active language has no value)
 * `hebrew.json` is the final fallback and stays in the client bundle, so the
 * server never has to ship all 1,374 base strings.
 */
const initialDirection = hebrewTexts.direction === 'ltr' ? 'ltr' : 'rtl'
let config = {
    code: 'he',
    direction: initialDirection,
    texts: {},
    fallback: {}
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function findValue(source, key) {
    if (!isPlainObject(source) || typeof key !== 'string') return undefined

    let value
    if (Object.prototype.hasOwnProperty.call(source, key)) value = source[key]
    else {
        const lower = key.toLowerCase()
        if (lower !== key && Object.prototype.hasOwnProperty.call(source, lower))
            value = source[lower]
    }

    return typeof value === 'string' && value !== '' ? value : undefined
}

function translate(key) {
    if (typeof key !== 'string') return undefined

    const value = findValue(config.texts, key)
        ?? findValue(config.fallback, key)
        ?? findValue(baseTexts, key)

    return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Configure the runtime dictionary. Called before hydration/SSR render and on
 * every language switch. Safe to call with a partial payload: missing layers
 * simply fall back to the previous/base behaviour.
 */
export function configureTexts(next) {
    if (!next || typeof next !== 'object') return config

    config = {
        code: typeof next.code === 'string' && next.code ? next.code : 'he',
        direction: next.direction === 'ltr' ? 'ltr' : 'rtl',
        texts: isPlainObject(next.texts) ? next.texts : {},
        fallback: isPlainObject(next.fallback) ? next.fallback : {}
    }

    return config
}

export function getTextConfig() {
    return config
}

/** Apply the active language to <html lang/dir> (browser only). */
export function applyTextDirection(texts) {
    if (typeof document === 'undefined') return
    const next = texts && typeof texts === 'object' ? texts : config
    document.documentElement.lang = typeof next.code === 'string' && next.code ? next.code : 'he'
    document.documentElement.dir = next.direction === 'ltr' ? 'ltr' : 'rtl'
}

/**
 * Translate a key using the active language, Hebrew overrides, then
 * hebrew.json, with optional [param] interpolation.
 *
 * @param {string} key - Translation key (or literal fallback text)
 * @param {Object} [params] - Values for [name] placeholders, e.g. { username: 'משה' }
 * @returns {string} Translated + interpolated string
 *
 * @example TR('hi [username]', { username: 'משה' }) // -> "שלום משה" (if mapped)
 */
export default function TR(key, params) {
    const str = translate(key) ?? key
    if (!params || typeof str !== 'string') return str
    return str.replace(/\[(\w+)\]/g, (_, name) =>
        params[name] !== undefined && params[name] !== null
            ? String(params[name])
            : `[${name}]`
    )
}

export { TR }
