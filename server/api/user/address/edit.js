import { updateOrderAddress } from '#server/api/order/address/update.js'

const sameLocationFields = [
    'city',
    'street',
    'building',
    'apartment',
    'residenceType'
]
const isSameLocation = (address1, address2) => {
    const sameFields = sameLocationFields.every(f =>
        address1[f] === address2[f]
    )
    const sameLocation = JSON.stringify(address1?.location?.coordinates) === JSON.stringify(address2.location?.coordinates)
    return sameFields && sameLocation
}

export default async function edit(payload, { DL, _user, external, utils }) {
    const existingAddr = _user.addresses.find(a => a.addressId === payload.addressId)
    if (!existingAddr) throw { status: 404, message: 'address not found' }

    const geocoded = await external.geocode.address(payload)
    geocoded.active = existingAddr.active

    const sameLocation = isSameLocation(geocoded, existingAddr)

    const user = await DL.User.updateOne(
        { id: _user.id, 'addresses.addressId': payload.addressId },
        { $set: { 'addresses.$': geocoded } },
        { select: DL.User.defaultSelect }
    )

    await DL.redis.del(`user_auth:${_user.id}`)
    if (sameLocation) return { user }

    const order = await utils.data.getUserOrder({ DL, _user })

    const { DELIVERY_METHOD } = DL.Order.constants
    const orderUpdateRequired = geocoded.active && order.deliveryMethod === DELIVERY_METHOD.DELIVERY
    if (!orderUpdateRequired) return { user }

    const updatedOrder = await updateOrderAddress({ DL, order, address: geocoded })
    return {
        user,
        order: updatedOrder
    }
}

edit.config = { auth: 'required', required: ['addressId', 'city', 'street', 'building'] }
