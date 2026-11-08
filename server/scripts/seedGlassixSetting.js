/**
 * Seed the per-domain Glassix chat-widget Setting (idempotent, safe to re-run).
 * Usage:
 *   node server/scripts/runSeed.js seedGlassixSetting
 *   node server/scripts/runSeed.js seedGlassixSetting <domainId>
 *
 * Stored as one public `config` under category 'integrations' / subCategory
 * 'glassix' so it renders in Admin -> Settings next to the other integrations
 * and reaches the storefront as settings.integrations.glassix.
 *
 * Seeded disabled with empty credentials: an admin fills apiKey + snippetId from
 * the Glassix widget snippet, then flips enabled to 'true'. Both halves must be
 * present before the client loads anything — see common/functions/glassix.js.
 *
 * Note for when CSP is tightened (see server/middleware/security.js): the widget
 * needs script-src for both GLASSIX_ORIGINS hosts, frame-src for its chat
 * iframe, and style-src/font-src for the Rubik font its CSS imports.
 */
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
        const existing = await DL.Setting.readOne({ domainId: domain.id, key: 'glassix' })
        if (existing) continue
        await DL.Setting.create({
            key: 'glassix',
            value: { enabled: 'false', apiKey: '', snippetId: '' },
            domainId: domain.id,
            category: 'integrations',
            subCategory: 'glassix',
            formType: 'config',
            renderType: 'config',
            public: true,
            hidden: false
        })
        created++
        console.log(`[glassix] created glassix setting for domain ${domain.id}`)
    }
    console.log(`[glassix] Done — ${created} created, rest already existed`)
}
