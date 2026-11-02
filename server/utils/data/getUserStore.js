import { GUEST_CART_TOKEN_COOKIE } from '#common/constants.js'
import log from '#server/utils/log.js'

const USER_STORE_TTL_SEC = 60 * 5

const cacheKey = (userId) => `user_store:${userId}`

// The cart order's store is the storefront's stock context, so it is resolved on
// every product/display request and cached for the TTL. Every write that can move
// the cart order's store must invalidate it — see invalidateUserStore.
export default async function getUserStore(req, { DL, utils, _user }) {
    const user = _user || await utils.auth.getUser(req, { DL, utils }).catch(() => null)
    if (user) {
        const key = cacheKey(user.id)
        const cached = await DL.redis?.get(key).catch(() => null)
        if (cached) return cached === 'null' ? null : cached

        const order = await DL.Order.readOne({ userId: user.id, status: 'cart', active: true }, { _id: 0, storeId: 1 })
        const storeId = order?.storeId ?? null
        await DL.redis?.set(key, storeId ?? 'null', 'EX', USER_STORE_TTL_SEC).catch(() => null)
        return storeId
    }

    const guestToken = req?.cookies?.[GUEST_CART_TOKEN_COOKIE]
    if (guestToken) {
        const guestCart = await DL.GuestCart.readOne({ id: guestToken, active: true }, { _id: 0, storeId: 1 })
        return guestCart?.storeId ?? null
    }

    return null
}

// A failed delete keeps the previous store for the whole TTL, so it is logged
// rather than swallowed.
export async function invalidateUserStore(DL, userId) {
    if (!userId || !DL.redis) return
    try {
        await DL.redis.del(cacheKey(userId))
    } catch (e) {
        log.warn('Cache[user_store] delete failed:', e?.message || e)
    }
}
