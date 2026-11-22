import hebrewTexts from '../../texts/hebrew.json' with { type: 'json' }

const texts = hebrewTexts.texts || {}

/**
 * Invoice copy is legal-document text: it stays Hebrew even when the admin UI
 * is switched to another language. The keys live in hebrew.json so the wording
 * can be managed in one place.
 */
export default function invoiceText(key, params, fallback = '') {
    const template = texts[key] ?? fallback
    if (!params) return template
    return String(template).replace(/\[(\w+)\]/g, (_, name) =>
        params[name] !== undefined && params[name] !== null ? String(params[name]) : `[${name}]`
    )
}
