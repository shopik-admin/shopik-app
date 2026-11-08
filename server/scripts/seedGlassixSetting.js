/**
 * Seed the per-domain Glassix widget settings (idempotent, safe to re-run).
 * Usage:
 *   node server/scripts/runSeed.js seedGlassixSetting
 *   node server/scripts/runSeed.js seedGlassixSetting <domainId>
 *
 * Two entries per domain:
 *
 * 1. `glassix` — public `config` under category 'integrations' / subCategory
 *    'glassix', so it renders in Admin -> Settings next to the other
 *    integrations and reaches the storefront as settings.integrations.glassix.
 *    Seeded disabled with empty credentials: an admin fills apiKey + snippetId
 *    from the Glassix widget snippet, then flips enabled to 'true'. Both halves
 *    must be present before the client loads anything — common/functions/glassix.js.
 *
 * 2. `chat-button-bg` — public `color` under category 'theme' / subCategory
 *    'colors', next to header-bg and product-button-bg. entry-server.jsx injects
 *    every settings.theme entry as a :root var, so this becomes
 *    var(--chat-button-bg) and client/features/Glassix/glassix.css paints the
 *    chat launcher with it. Kept separate from header-bg on purpose: the chat
 *    bubble needs its own color because the header color can be too dark or too
 *    light for Glassix's white launcher icon.
 *
 * Existing keys are never overwritten — edit values in Admin -> Settings.
 *
 * Note for when CSP is tightened (see server/middleware/security.js): the widget
 * needs script-src for both GLASSIX_ORIGINS hosts, frame-src for its chat
 * iframe, and style-src/font-src for the Rubik font its CSS imports.
 */
const CHAT_BUTTON_COLOR = '#8bc652'

const SETTINGS = [
    {
        key: 'glassix',
        value: { enabled: 'false', apiKey: '', snippetId: '' },
        category: 'integrations',
        subCategory: 'glassix',
        formType: 'config',
        renderType: 'config',
        public: true,
        hidden: false
    },
    {
        key: 'chat-button-bg',
        // Same { light, dark } shape header-bg/product-button-bg use, so Admin
        // shows both pickers straight away.
        value: { light: CHAT_BUTTON_COLOR, dark: CHAT_BUTTON_COLOR },
        category: 'theme',
        subCategory: 'colors',
        formType: 'color',
        renderType: 'color',
        public: true,
        hidden: false
    }
]

export default async function seedGlassixSetting({ DL }) {
    const domainFilter = process.argv[3]
    const domains = await DL.Domain.read(
        domainFilter ? { id: domainFilter } : {},
        { _id: 0, id: 1, name: 1 },
        { limit: 0 }
    )
    if (!domains?.length) {
        console.log('[glassix] no domains found, nothing to seed')
        return
    }

    let created = 0
    for (const domain of domains) {
        for (const setting of SETTINGS) {
            const existing = await DL.Setting.readOne({ domainId: domain.id, key: setting.key })
            if (existing) continue
            await DL.Setting.create({ ...setting, domainId: domain.id })
            created++
            console.log(`[glassix] created ${setting.key} for domain ${domain.id}`)
        }
    }
    console.log(`[glassix] Done — ${created} created, rest already existed`)
}
