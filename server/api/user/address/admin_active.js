export default async function admin_active(payload, { DL }) {
    const { userId, addressId } = payload
    const user = await DL.User.readById(userId)
    if (!user) throw { status: 404, message: 'user not found' }
    if (!(user.addresses || []).some(a => a.addressId === addressId))
        throw { status: 404, message: 'address not found' }

    const updatedUser = await DL.User.Model.findOneAndUpdate(
        { id: user.id, 'addresses.addressId': addressId },
        [{
            $set: {
                addresses: {
                    $map: {
                        input: '$addresses',
                        as: 'address',
                        in: {
                            $mergeObjects: [
                                '$$address',
                                {
                                    active: {
                                        $eq: ['$$address.addressId', addressId]
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        }],
        {
            returnDocument: 'after',
            projection: DL.User.defaultSelect,
            updatePipeline: true
        }
    ).lean()
    await DL.redis?.del(`user_auth:${user.id}`)
    // Direct Model write bypasses DL.updateOne, so invalidate the
    // User version-cache explicitly — otherwise user/details keeps
    // serving the pre-update doc from cache.
    try {
        await DL.User.Model.cache?.del(user.id)
    } catch { }
    return { user: updatedUser }
}

admin_active.config = { required: ['userId', 'addressId'], permissions: 'user:update' }
