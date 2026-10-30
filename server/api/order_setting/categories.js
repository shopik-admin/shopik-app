// Category picker source for the Order Settings page (Comax category tree
// already materialized by comax_product/build_categories).
export default async function categories(payload, { DL }) {
    return DL.Category.read(
        {},
        { _id: 0, id: 1, name: 1, path: 1, parentId: 1, parentIds: 1 },
        { limit: 0, sort: { path: 1 } }
    )
}

categories.config = {
    permissions: ['setting:read']
}
