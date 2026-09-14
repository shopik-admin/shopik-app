import { editAddress } from '#server/utils/data/userAddress.js'

export default async function admin_edit(payload, { DL, external }) {
    const { userId, addressId, ...address } = payload
    const user = await DL.User.readById(userId)
    if (!user) throw { status: 404, message: 'user not found' }

    const { geocoded } = await editAddress({ DL, external, user, addressId, address })

    const updatedUser = await DL.User.updateOne(
        { id: user.id, 'addresses.addressId': addressId },
        { $set: { 'addresses.$': geocoded } },
        { select: DL.User.defaultSelect }
    )
    await DL.redis?.del(`user_auth:${user.id}`)
    return { user: updatedUser }
}

admin_edit.config = { required: ['userId', 'addressId', 'city', 'street', 'building'], permissions: 'user:update' }
