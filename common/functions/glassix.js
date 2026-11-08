// Resolve the per-domain Glassix chat-widget config.
//
// Stored as a single public `config` Setting (key `glassix`, category
// `integrations`, subCategory `glassix`) so every domain gets its own
// enabled/apiKey/snippetId triple and Admin -> Settings renders it like the
// other integration configs (ezcount, payment). getSettings() ships it to the
// client as settings.integrations.glassix — a config Setting is encrypted at
// rest but decrypted on read, so the client always sees a plain object.
//
// Kept DOM-free on purpose: entry-server.jsx needs it for the head preconnect
// gate and node --test needs it directly.
export const GLASSIX_ORIGINS = [
    'https://cdn.glassix.com',
    'https://cdn.glassix.net'
]

// Version-pinned script path, exactly as the Glassix snippet serves it. Bump it
// here (in one place) if Glassix ships a new widget version.
export const GLASSIX_SCRIPT_PATH = '/clients/widget.1.2.min.js'
export const glassixScriptUrl = (origin) => `${origin}${GLASSIX_SCRIPT_PATH}`

// Admin -> Settings -> ConfigEditor stringifies every config value, so the
// `enabled` flag arrives as 'true'/'false' strings after any admin edit.
// Accept the same shape Setting.jsx toggles use.
const TRUTHY = new Set([true, 'true', '1', 1])

const clean = (value) => typeof value === 'string' ? value.trim() : ''

// Returns { apiKey, snippetId } only when the widget is fully configured for
// this domain. Returning null for a half-filled config (an admin mid-setup) is
// what keeps both the loader and the head preconnect from touching Glassix on
// a domain that never opted in.
export function resolveGlassixConfig(settings) {
    const config = settings?.integrations?.glassix
    if (!config || typeof config !== 'object' || Array.isArray(config)) return null
    if (!TRUTHY.has(config.enabled)) return null

    const apiKey = clean(config.apiKey)
    const snippetId = clean(config.snippetId)
    if (!apiKey || !snippetId) return null

    return { apiKey, snippetId }
}
