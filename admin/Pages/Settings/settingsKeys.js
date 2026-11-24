/**
 * Translation keys for the Settings screen.
 *
 * Every label / hint is derived from the data itself (`category`,
 * `subCategory`, `key`, `formType`) so the copy lives in the translation
 * dictionary (hebrew.json) and stays editable from Admin → Translations —
 * no separate metadata table and no database change.
 *
 * Resolution order for a setting row:
 *   1. `settings_key_<key>`           (human label, e.g. "תמונת שיתוף")
 *   2. `settings_key_<key>_hint`      (explanation under the label)
 *   3. `settings_type_<formType>`     (generic explanation for the control type)
 *   4. prettyKey(key)                 (camelCase / kebab-case → "Og image")
 */

// Same scheme for every part so a key is always predictable and greppable.
function sanitize(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^\w-]+/g, '_')
        .replace(/-/g, '_')
        .replace(/^_+|_+$/g, '')
}

export const settingsKeyName = {
    category: (category) => `settings_cat_${sanitize(category)}`,
    categoryHint: (category) => `settings_cat_${sanitize(category)}_hint`,
    subCategory: (subCategory) => `settings_sub_${sanitize(subCategory)}`,
    subCategoryHint: (subCategory) => `settings_sub_${sanitize(subCategory)}_hint`,
    setting: (key) => `settings_key_${sanitize(key)}`,
    settingHint: (key) => `settings_key_${sanitize(key)}_hint`,
    typeHint: (formType, renderType) => `settings_type_${sanitize(formType || renderType || 'text')}`
}

/**
 * `TR` returns the key itself when it has no translation. Treat that as
 * "missing" so callers can fall back to a generated label.
 */
function translated(TR, key, params) {
    if (!key || typeof TR !== 'function') return ''
    const value = TR(key, params)
    return value && value !== key ? value : ''
}

/** `ogImage` → "Og image", `menu-sales-bg` → "Menu sales bg". */
export function prettyKey(key) {
    const text = String(key ?? '')
        .replace(/[-_.]+/g, ' ')
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim()
    if (!text) return ''
    return text.charAt(0).toUpperCase() + text.slice(1)
}

export function settingLabel(TR, setting) {
    return translated(TR, settingsKeyName.setting(setting?.key)) || prettyKey(setting?.key)
}

export function settingHint(TR, setting) {
    const settingSpecific = translated(TR, settingsKeyName.settingHint(setting?.key), { key: setting?.key })
    if (settingSpecific) return settingSpecific
    return translated(TR, settingsKeyName.typeHint(setting?.formType, setting?.renderType))
}

export function categoryLabel(TR, category) {
    return translated(TR, settingsKeyName.category(category)) || prettyKey(category) || 'General'
}

export function categoryHint(TR, category) {
    return translated(TR, settingsKeyName.categoryHint(category))
}

export function subCategoryLabel(TR, subCategory) {
    return translated(TR, settingsKeyName.subCategory(subCategory)) || prettyKey(subCategory) || 'General'
}

export function subCategoryHint(TR, subCategory) {
    return translated(TR, settingsKeyName.subCategoryHint(subCategory))
}
