import { GUEST_CART_TOKEN_COOKIE, GUEST_CART_TTL_MS } from '#common/constants.js'
import handleSelect from '#server/dl/handleSelect.js'
import filterClientOrder from './filterClientOrder.js'
import enrichCart from './enrichCart.js'

export async function getGuestCart({ req, DL }) {
    const token = req?.cookies?.[GUEST_CART_TOKEN_COOKIE]
    if (!token) return
    const guest = await DL.GuestCart.readOne({ id: token, active: true }, DL.GuestCart.defaultSelect)
    if (guest) await enrichCart(guest, DL)
    return guest ? filterClientOrder(guest) : undefined
}

export async function getOrCreateGuestCart({ cookies, DL, setCookie, domainId }) {
    if (!domainId) throw { status: 500, message: 'missing domainId for guest cart' }
    let guest
    if (cookies?.[GUEST_CART_TOKEN_COOKIE]) {
        guest = await DL.GuestCart.readOne({ id: cookies[GUEST_CART_TOKEN_COOKIE], active: true }, DL.GuestCart.defaultSelect)
        if (guest) await enrichCart(guest, DL)
    }
    if (!guest) {
        const created = await DL.GuestCart.create({ domainId })
        guest = handleSelect(created.toObject(), DL.GuestCart.defaultSelect)
        setCookie(GUEST_CART_TOKEN_COOKIE, guest.id, GUEST_CART_TTL_MS)
    }
    return guest
}

export default getGuestCart