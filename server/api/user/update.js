import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, _admin }) {
    const { id } = payload
    const user = await DL.User.readById(id)
    if (!user) throw { status: 400, message: 'user does not exist' }

    const update = diff(user, payload)
    if (!_admin.hasPermission('user:block'))
        delete update.blocked

    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return user
    const invalidatingFields = ['phone', 'blocked']
    for (const field of invalidatingFields) {
        if (update[field]) {
            await DL.redis.del(`user_auth:${id}`)
            update.tokens = {}
            break
        }
    }
    const updatedUser = await DL.User.updateOne({ id }, update)
    return updatedUser
}

update.config = { required: ['id'], permissions: 'user:update' }
