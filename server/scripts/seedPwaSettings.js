/**
 * Seed the `appIcon` appearance setting (idempotent, safe to re-run).
 * Usage:
 *   node server/scripts/runSeed.js seedPwaSettings
 *   node server/scripts/runSeed.js seedPwaSettings <domainId>
 *
 * Stored under category 'appearance' / subCategory 'general' so it renders in
 * Admin -> Settings next to the logo and favicon, and is available to the
 * client as settings.appearance.appIcon.
 *
 * The value stays empty until an admin uploads an icon; the manifest falls
 * back to the default icons in /icons in the meantime.
 *
 * appIcon is the single domain image setting: it serves the PWA manifest
 * icons, the apple-touch-icon and og:image/twitter:image (buildMeta uses its
 * 512 variant). The `sizes` below are the named PNG variants generated on
 * upload (see server/api/setting/upload_file.js); existing seeded rows are
 * patched so the admin preview uses them too.
 */
const APP_ICON_SIZES = {
    '192.png': 192,
    '512.png': 512,
    'maskable-512.png': 512,
    'apple-180.png': 180
}

export default async function seedPwaSettings({ DL }) {
    const domainFilter = process.argv[3]
    const domains = await DL.Domain.read(
        domainFilter ? { id: domainFilter } : {},
        { _id: 0, id: 1, name: 1 },
        { limit: 0 }
    )
    if (!domains?.length) {
        console.log('[pwaSettings] no domains found, nothing to seed')
        return
    }

    let created = 0
    for (const domain of domains) {
        const existing = await DL.Setting.readOne({ domainId: domain.id, key: 'appIcon' })
        if (existing) {
            if (!existing.sizes) {
                await DL.Setting.updateOne({ id: existing.id }, { sizes: APP_ICON_SIZES })
                console.log(`[pwaSettings] patched sizes for appIcon on domain ${domain.id}`)
            }
            continue
        }
        await DL.Setting.create({
            key: 'appIcon',
            value: '',
            domainId: domain.id,
            category: 'appearance',
            subCategory: 'general',
            formType: 'image',
            renderType: 'image',
            sizes: APP_ICON_SIZES,
            public: true,
            hidden: false
        })
        created++
        console.log(`[pwaSettings] created appIcon for domain ${domain.id}`)
    }
    console.log(`[pwaSettings] Done — ${created} created, rest already existed`)
}
