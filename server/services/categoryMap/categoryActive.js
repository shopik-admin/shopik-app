// Cascade of Category.active to the sub-groups it contains.
//
// The admin checkbox edits one category, but a branch is a unit: deactivating a
// parent deactivates every category below it too (and reactivating brings the
// branch back). Products are hidden through the mirrored `categoryActive` flag
// on category_map, never by rewriting `showOnSite`: a sub-group Comax marked
// hidden stays hidden whatever the admin does to the category.

/**
 * Every category id in the subtree rooted at `id` (the id itself included).
 * `parentIds` stores all ancestors, so one membership test reaches any depth
 * without walking the tree.
 */
export function descendantIds(categories, id) {
    const root = String(id)
    return [
        root,
        ...(categories || [])
            .filter(category => category.id !== root && (category.parentIds || []).includes(root))
            .map(category => category.id)
    ]
}

/**
 * Write the effective active state of each sub-group's mapped category onto its
 * category_map row. Rows mapped to no category (or to a category that no longer
 * exists) count as active, so they stay visible and fixable in the admin.
 *
 * `categoryIds` limits the write to rows mapped to those categories; omit it to
 * reconcile the whole map (imports, backfill). Only rows whose value actually
 * changes are written, so legacy rows with no flag are left untouched while
 * they stay active.
 *
 * Returns the codes that relaxed / tightened so the caller can run the product
 * status sweep in both directions.
 */
export async function mirrorCategoryActive({ DL, categoryIds = null, dryRun = false }) {
    const [categories, rows] = await Promise.all([
        DL.Category.read({}, { _id: 0, id: 1, active: 1 }, { limit: 0 }),
        DL.CategoryMap.read(
            {},
            { _id: 0, subGroupCode: 1, categoryId: 1, categoryActive: 1 },
            { limit: 0 }
        )
    ])

    const activeById = new Map(
        (categories || []).map(category => [category.id, category.active !== false])
    )
    const scope = categoryIds ? new Set(categoryIds.map(String)) : null
    const docs = []
    const relaxed = []
    const tightened = []

    for (const row of rows || []) {
        if (row?.subGroupCode == null) continue
        const categoryId = row.categoryId || null
        if (scope && !scope.has(categoryId)) continue

        const desired = categoryId ? activeById.get(categoryId) ?? true : true
        const current = row.categoryActive !== false
        if (desired === current) continue

        docs.push({ subGroupCode: row.subGroupCode, categoryActive: desired })
        if (desired) relaxed.push(String(row.subGroupCode))
        else tightened.push(String(row.subGroupCode))
    }

    if (!dryRun && docs.length) {
        await DL.CategoryMap.bulkWrite({
            docs,
            getFilter: doc => ({ subGroupCode: doc.subGroupCode }),
            getUpsert: () => false,
            getUpdate: doc => ({ $set: { categoryActive: doc.categoryActive } })
        })
    }

    return {
        changed: docs.length,
        written: dryRun ? 0 : docs.length,
        relaxed,
        tightened
    }
}
