import { GUEST_CART_TOKEN_COOKIE } from '#common/constants.js'

export default async function getUserStore(req, { DL, utils, _user: injected }) {
    const user = injected || await utils.auth.getUser(req, { DL, utils }).catch(() => null)
    if (user) {
        const cacheKey = `user_store:${user.id}`
        const cached = await DL.redis?.get(cacheKey)
        if (cached) return cached === 'null' ? null : cached

        const order = await DL.Order.readOne({ userId: user.id, status: 'cart', active: true }, { _id: 0, storeId: 1 })
        const storeId = order?.storeId ?? null
        await DL.redis?.set(cacheKey, storeId ?? 'null', 'EX', 60 * 5)
        return storeId
    }

    const guestToken = req?.cookies?.[GUEST_CART_TOKEN_COOKIE]
    if (guestToken) {
        const guestCart = await DL.GuestCart.readOne({ id: guestToken, active: true }, { _id: 0, storeId: 1 })
        return guestCart?.storeId ?? null
    }

    return null
}
