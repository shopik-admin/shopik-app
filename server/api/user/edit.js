import diff from '#common/functions/diff.js'
import uid from '#common/functions/uid.js'

export default async function edit(payload, { DL, _user, external, utils }) {
    const name = utils.extractFields.getName(payload)
    if (name) payload.name = name

    const update = diff(_user, payload)

    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return { user: _user }

    let phoneChanged = false,
        token
    if (update.phone) {
        const currentOtps = await DL.Otp.count({ phone: update.phone })
        if (currentOtps >= 5) throw { status: 400, message: 'too many otps' }
        phoneChanged = true
        token = uid()
        const otp = uid(6, true)
        await DL.Otp.create({
            phone: update.phone,
            token,
            otp,
            userId: _user.id
        })
        await external.sms.otp(update.phone, otp)
        delete update.phone
    }

    let savedUser
    if (Object.keys(update).length > 0)
        savedUser = await DL.User.updateOne({ id: _user.id }, update, { select: DL.User.defaultSelect })

    if (!savedUser)
        savedUser = _user

    await DL.redis.del(`user_auth:${_user.id}`)

    if (phoneChanged)
        return { user: savedUser, phone: payload.phone, token }

    await DL.redis.del(`user_auth:${savedUser.id}`)

    return { user: savedUser }
}

edit.config = { auth: 'required' }
