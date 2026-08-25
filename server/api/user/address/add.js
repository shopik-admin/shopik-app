import uid from '#common/functions/uid.js'
import { updateOrderAddress } from '#server/api/order/address/update.js'
import { findByLocation } from '#server/external/supplyArea.js'

export default async function add(payload, { DL, _user, external, utils }) {
    payload.addressId = uid()
    const geocoded = await external.geocode.address(payload)

    const area = await findByLocation(DL, geocoded.location)
    geocoded.areaId = area?.id ?? null
    geocoded.hasService = !!area

    const hasActiveAddress = _user.addresses && _user.addresses.some(a => a.active)

    geocoded.active = !hasActiveAddress

    const updatedUser = await DL.User.updateOne(
        { id: _user.id },
        { $push: { addresses: geocoded } },
        { select: DL.User.defaultSelect }
    )
    await DL.redis?.del(`user_auth:${_user.id}`)
    if (!geocoded.active) return updatedUser

    const order = await utils.data.getUserOrder({ DL, _user })
    const { DELIVERY_METHOD } = DL.Order.constants
    if (order.deliveryMethod === DELIVERY_METHOD.DELIVERY) {
        await updateOrderAddress({
            DL,
            utils,
            address: geocoded,
            order,
            actor: utils.data.timeline.userActor(_user)
        })
    }

    return updatedUser
}

add.config = { auth: 'required', required: ['city', 'street', 'building'] }
