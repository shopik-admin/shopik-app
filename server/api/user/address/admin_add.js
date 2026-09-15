import { addAddress } from '#server/utils/data/userAddress.js'

export default async function admin_add(payload, { DL, external }) {
    const { userId, ...address } = payload
    const user = await DL.User.readById(userId)
    if (!user) throw { status: 404, message: 'user not found' }

    const geocoded = await addAddress({ DL, external, user, address })

    const updatedUser = await DL.User.updateOne(
        { id: user.id },
        { $push: { addresses: geocoded } },
        { select: DL.User.defaultSelect }
    )
    await DL.redis?.del(`user_auth:${user.id}`)
    return { user: updatedUser }
}

admin_add.config = { required: ['userId', 'city', 'street', 'building'], permissions: 'user:update' }
