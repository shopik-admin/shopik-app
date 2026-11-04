import getUserFavorites, { MAX_FAVORITES } from '#server/utils/data/getUserFavorites.js'

// Toggle one product in the user's favourites. Returns the full updated list
// so the client never needs a follow-up read.
export default async function favorite({ productId }, { DL, _user }) {
    const userId = String(_user.id)
    const id = String(productId || '').trim()

    const existing = await DL.UserFavorite.readOne({ userId, productId: id })

    if (existing) {
        await DL.UserFavorite.deleteOne({ _id: existing._id })
    } else {
        const product = await DL.Product.readOne(
            { id, status: DL.Product.constants.STATUS.ACTIVE },
            { _id: 0, id: 1 }
        )
        if (!product) throw { status: 404, message: 'product not found' }

        const count = await DL.UserFavorite.count({ userId })
        if (count >= MAX_FAVORITES)
            throw { status: 400, message: `favorites limit reached (${MAX_FAVORITES})` }

        try {
            await DL.UserFavorite.create({ userId, productId: id })
        } catch (e) {
            // Concurrent double-tap: the unique index already stored it.
            if (e?.status !== 409) throw e
        }
    }

    const favoriteIds = await getUserFavorites({ DL, userId })
    return { favoriteIds }
}

favorite.config = { auth: 'required', required: ['productId'] }
