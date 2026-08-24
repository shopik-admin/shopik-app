import diff from '#common/functions/diff.js'
import filterClientOrder from '#server/utils/data/filterClientOrder.js'
import { GUEST_CART_TOKEN_COOKIE } from '#common/constants.js'

export default async function clear(payload, { DL, _user, utils, cookies }) {
    let cartOrder
    if (_user?.id) {
        cartOrder = await utils.data.getUserOrder({ DL, _user })
    } else {
        const token = cookies?.[GUEST_CART_TOKEN_COOKIE]
        if (!token) return { order: null }
        cartOrder = await DL.GuestCart.readOne({ id: token, active: true }, DL.GuestCart.defaultSelect)
    }
    if (!cartOrder) return { order: null }

    const updatedOrder = {
        ...cartOrder,
        cart: [],
        sales: {},
        sum: 0,
        sumNoCoupon: 0,
        finalSum: 0,
        finalSumNoCoupon: 0,
        customerUpdatedAt: new Date()
    }

    const updateData = diff(cartOrder, updatedOrder)
    let finalOrder = cartOrder

    if (Object.keys(updateData).length > 0) {
        const savedOrder = _user?.id
            ? await DL.Order.updateOne({ id: cartOrder.id }, { $set: updateData })
            : await DL.GuestCart.updateOne({ id: cartOrder.id }, { $set: updateData })
        if (savedOrder) finalOrder = savedOrder
    }

    return { order: filterClientOrder(finalOrder) }
}

clear.config = {
    auth: 'lax',
    permission: null
}
