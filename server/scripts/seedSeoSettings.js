/**
 * Seed public per-domain SEO settings (idempotent, safe to re-run).
 * Usage: node server/scripts/runSeed.js seedSeoSettings
 *
 * Stored under category 'seo' / subCategory 'general' so they are available
 * to the client as settings.seo.* (used by common/functions/buildMeta.js for
 * Open Graph / Twitter cards) and editable in Admin -> Settings.
 * Existing values are never overwritten.
 *
 * The image for og:image comes from the single `appearance.appIcon` setting
 * (seeded by seedPwaSettings) — a separate seo.ogImage setting used to exist
 * and is cleaned up below.
 */
export default async function seedSeoSettings({ DL }) {
    const domains = await DL.Domain.read({}, { _id: 0, id: 1, name: 1 }, { limit: 0 })
    if (!domains?.length) {
        console.log('[seo] no domains found, nothing to seed')
        return
    }

    let created = 0
    for (const domain of domains) {
        const rows = [
            { key: 'seoTitle', value: domain.name, formType: 'text', renderType: 'string' },
            { key: 'seoDescription', value: '', formType: 'textarea', renderType: 'string' },
            { key: 'ogType', value: 'website', formType: 'text', renderType: 'string' },
            { key: 'twitterCard', value: 'summary_large_image', formType: 'text', renderType: 'string' }
        ]
        for (const row of rows) {
            const existing = await DL.Setting.readOne({ domainId: domain.id, key: row.key })
            if (existing) continue
            await DL.Setting.create({
                ...row,
                domainId: domain.id,
                category: 'seo',
                subCategory: 'general',
                public: true,
            })
            created++
            console.log(`[seo] ${row.key} created for domain ${domain.id}`)
        }

        // Cleanup: the duplicate seo.ogImage setting (appIcon serves both now).
        const staleOgImage = await DL.Setting.readOne({ domainId: domain.id, key: 'ogImage' })
        if (staleOgImage) {
            await DL.Setting.deleteOne({ id: staleOgImage.id })
            console.log(`[seo] removed duplicate ogImage for domain ${domain.id} (appIcon is the single image setting)`)
        }
    }
    console.log(`[seo] Done - ${created} created, rest already existed`)
}
