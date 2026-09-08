import hebrewTexts from './hebrew.json'

const texts = hebrewTexts.texts || {}

/**
 * Translate a key using hebrew.json texts, with optional [param] interpolation.
 *
 * @param {string} key - Translation key (or literal fallback text)
 * @param {Object} [params] - Values for [name] placeholders, e.g. { username: 'משה' }
 * @returns {string} Translated + interpolated string
 *
 * @example TR('hi [username]', { username: 'משה' }) // -> "שלום משה" (if mapped)
 */
export default function TR(key, params) {
    const str = texts[key] || texts[key?.toLowerCase?.()] || key
    if (!params || typeof str !== 'string') return str
    return str.replace(/\[(\w+)\]/g, (_, name) =>
        params[name] !== undefined && params[name] !== null
            ? String(params[name])
            : `[${name}]`
    )
}

export { TR }
