/**
 * Assign display icons to top-level categories (idempotent, safe to re-run).
 * Usage: node server/scripts/runSeed.js seedCategoryIcons
 *
 * Only sets `icon` where empty — manual overrides are never overwritten.
 * Uses DL wrappers so the Redis HASHSET cache stays in sync, and drops the
 * cached storefront `menu` (60min TTL) so icons show immediately.
 */
import { invalidateMenu } from '#server/utils/data/getMenu.js'
const TOP_LEVEL_ICONS = [
    { name: 'חלב, ביצים ותחליפים', icon: 'milk' },
    { name: 'מעדנייה, סלטים ואוכל מוכן', icon: 'salad' },
    { name: 'לחם ומאפים', icon: 'croissant' },
    { name: 'שתייה, קפה ותה', icon: 'cup' },
    { name: 'בשר, עוף ודגים', icon: 'beef' },
    { name: 'פירות וירקות', icon: 'apple' },
    { name: 'קפואים', icon: 'snow' },
    { name: 'חטיפים ומתוקים', icon: 'sparkles' },
    { name: 'מזווה, בישול ואפייה', icon: 'basket' },
    { name: 'ניקיון, כביסה ונייר', icon: 'spray' },
    { name: 'פארם וטיפוח', icon: 'sparkles' },
    { name: 'לבית ולמטבח', icon: 'home' },
    { name: 'חד פעמי ואירוח', icon: 'cup' },
    { name: 'יין, בירה ואלכוהול', icon: 'cup' },
    { name: 'תינוקות ופעוטות', icon: 'baby' },
    { name: 'כללי', icon: 'grid' },
    { name: 'בעלי חיים', icon: 'heart' },
    { name: 'ביגוד, הנעלה ואביזרים', icon: 'bag' },
    { name: 'עישון ואביזרים', icon: 'cigarette' },
]

export default async function seedCategoryIcons({ DL }) {
    let set = 0
    for (const { name, icon } of TOP_LEVEL_ICONS) {
        const updated = await DL.Category.Model.findOneAndUpdate(
            { name, level: 1, parentId: null, $or: [{ icon: null }, { icon: '' }, { icon: { $exists: false } }] },
            { $set: { icon } },
            { returnDocument: 'after', projection: { _id: 0 } }
        ).lean()
        if (!updated) continue
        // findOneAndUpdate bypasses the DL wrapper — sync Redis manually
        await DL.Category.cache?.add(updated)
        set++
        console.log(`[categoryIcons] ${name} -> ${icon}`)
    }
    if (set > 0) await invalidateMenu({ DL })
    console.log(`[categoryIcons] Done — ${set} icons set`)
}
