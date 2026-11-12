// Resolve a product's category from its Comax sub-group code through the
// category_map. Shared by the nightly sync, the CSV importer and the admin
// reassignment endpoint so all three write identical product.category shapes.
export function productCategoryFor(subGroupCode, lookup) {
    const code = subGroupCode == null ? null : String(subGroupCode)
    const categoryId = code ? lookup?.mapByCode?.get(code) : null
    const category = categoryId ? lookup?.categoriesById?.get(categoryId) : null
    if (!category) return null
    return {
        id: category.id,
        title: category.name,
        pathIds: [...(category.parentIds || []), category.id]
    }
}

export async function loadCategoryLookup(DL) {
    const [maps, categories] = await Promise.all([
        DL.CategoryMap.read(
            {},
            { _id: 0, subGroupCode: 1, categoryId: 1, showOnSite: 1, requireKashrut: 1, categoryActive: 1 },
            { limit: 0 }
        ),
        DL.Category.read({}, { _id: 0, id: 1, name: 1, parentIds: 1 }, { limit: 0 })
    ])

    const mapByCode = new Map()
    // Missing flags mean the default (show, no kashrut rule), so rows imported
    // before the flags file keep behaving exactly as they did.
    const flagsByCode = new Map()
    for (const row of maps || []) {
        if (!row?.subGroupCode) continue
        const code = String(row.subGroupCode)
        mapByCode.set(code, row.categoryId || null)
        flagsByCode.set(code, {
            categoryActive: row.categoryActive !== false,
            showOnSite: row.showOnSite !== false,
            requireKashrut: row.requireKashrut === true
        })
    }

    return {
        mapByCode,
        flagsByCode,
        categoriesById: new Map((categories || []).map(category => [category.id, category])),
        // Before the first import there is no map at all. Callers keep the
        // existing category instead of wiping the catalog.
        hasMap: (maps || []).length > 0
    }
}
