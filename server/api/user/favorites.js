import getUserFavorites from '#server/utils/data/getUserFavorites.js'

// auth: 'lax' on purpose — guests get an empty list instead of a 401. The
// client apiReq reloads the page on 401, so a guest landing here must not throw.
export default async function favorites(payload, { DL, _user }) {
    if (!_user?.id) return { favoriteIds: [] }

    const favoriteIds = await getUserFavorites({ DL, userId: _user.id })
    return { favoriteIds }
}

favorites.config = { auth: 'lax' }
