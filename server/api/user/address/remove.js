export default async function remove(payload, { DL, _user }) {
    const updatedUser = await DL.User.updateOne(
        { id: _user.id },
        { $pull: { addresses: { addressId: payload.addressId } } },
        { select: DL.User.defaultSelect }
    )
    await DL.redis.del(`user_auth:${_user.id}`)
    return updatedUser
}

remove.config = { auth: 'required', required: ['addressId'] }
