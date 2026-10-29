/**
 * Seed the general-refund reason settings (idempotent, safe to re-run).
 * Usage:
 *   node server/scripts/runSeed.js seedRefundReasons
 *   node server/scripts/runSeed.js seedRefundReasons <domainId>
 *
 * Existing keys are never overwritten — edit values in Admin → Settings.
 * refund_reasons is one reason per line; refund_allow_other controls the
 * "אחר" option (free-text reason) in the admin refund form.
 */
import {
    DEFAULT_REFUND_REASONS,
    REFUND_ALLOW_OTHER_KEY,
    REFUND_REASONS_CATEGORY,
    REFUND_REASONS_KEY,
    REFUND_REASONS_SUB_CATEGORY,
} from '#common/constants/refundReasons.js'

export default async function seedRefundReasons({ DL }) {
    const domainFilter = process.argv[3]
    const domains = await DL.Domain.read(
        domainFilter ? { id: domainFilter } : {},
        { _id: 0, id: 1 },
        { limit: 0 }
    )
    if (!domains?.length) {
        console.log('[refundReasons] no domains found, nothing to seed')
        return
    }

    let created = 0
    for (const domain of domains) {
        const entries = [
            {
                key: REFUND_REASONS_KEY,
                value: DEFAULT_REFUND_REASONS.join('\n'),
                formType: 'textarea',
                renderType: 'string',
            },
            {
                key: REFUND_ALLOW_OTHER_KEY,
                value: true,
                formType: 'switch',
                renderType: 'boolean',
            },
        ]
        for (const entry of entries) {
            const existing = await DL.Setting.readOne({ domainId: domain.id, key: entry.key })
            if (existing) continue
            await DL.Setting.create({
                ...entry,
                domainId: domain.id,
                category: REFUND_REASONS_CATEGORY,
                subCategory: REFUND_REASONS_SUB_CATEGORY,
                public: false,
                hidden: false,
            })
            created++
        }
    }
    console.log(`[refundReasons] Done — ${created} created, rest already existed`)
}
