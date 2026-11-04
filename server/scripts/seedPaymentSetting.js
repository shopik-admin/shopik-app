/**
 * Seed the per-domain payment Setting (idempotent, safe to re-run).
 * Usage:
 *   node server/scripts/runSeed.js seedPaymentSetting
 *   node server/scripts/runSeed.js seedPaymentSetting <domainId>
 *
 * Stored under category 'payment' / subCategory 'general' so it renders in
 * Admin → Settings. `maxPayments` is the maximum number of payments the
 * customer may pick on Hyp's payment page. Missing setting falls back to 6.
 */
export default async function seedPaymentSetting({ DL }) {
    const domainFilter = process.argv[3]
    const domains = await DL.Domain.read(
        domainFilter ? { id: domainFilter } : {},
        { _id: 0, id: 1, name: 1 },
        { limit: 0 }
    )
    if (!domains?.length) {
        console.log('[payment] no domains found, nothing to seed')
        return
    }

    let created = 0
    for (const domain of domains) {
        const existing = await DL.Setting.readOne({ domainId: domain.id, key: 'payment' })
        if (existing) continue
        await DL.Setting.create({
            key: 'payment',
            value: { maxPayments: '6' },
            domainId: domain.id,
            category: 'payment',
            subCategory: 'general',
            formType: 'config',
            renderType: 'config',
            public: false,
            hidden: false
        })
        created++
        console.log(`[payment] created maxPayments setting for domain ${domain.id}`)
    }
    console.log(`[payment] Done — ${created} created, rest already existed`)
}
