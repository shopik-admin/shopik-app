// Product ids the user favourited, newest first. Shared by the SSR bootstrap
// (hearts render filled on first paint) and the favourites APIs.
export const MAX_FAVORITES = 200

export default async function getUserFavorites({ DL, userId, limit = MAX_FAVORITES } = {}) {
    if (!userId || !DL?.UserFavorite) return []

    const docs = await DL.UserFavorite.read(
        { userId: String(userId) },
        { _id: 0, productId: 1 },
        { sort: { addedAt: -1 }, limit }
    )

    return (docs || []).map(doc => doc.productId).filter(Boolean)
}
