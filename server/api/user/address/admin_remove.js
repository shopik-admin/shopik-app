export default async function admin_remove(payload, { DL }) {
    const { userId, addressId } = payload
    const user = await DL.User.readById(userId)
    if (!user) throw { status: 404, message: 'user not found' }

    const updatedUser = await DL.User.updateOne(
        { id: user.id },
        { $pull: { addresses: { addressId } } },
        { select: DL.User.defaultSelect }
    )
    await DL.redis?.del(`user_auth:${user.id}`)
    return { user: updatedUser }
}

admin_remove.config = { required: ['userId', 'addressId'], permissions: 'user:update' }
