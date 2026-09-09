// Category picker source for the display-block admin UI.
// (Category has no standalone read route; scoped here under display_block perms.)
export default async function categories(payload, { DL }) {
    return DL.Category.read(
        {},
        { _id: 0, id: 1, name: 1, path: 1, parentId: 1, parentIds: 1 },
        { limit: 0, sort: { path: 1 } }
    )
}

categories.config = {
    permissions: ['display_block:read']
}
