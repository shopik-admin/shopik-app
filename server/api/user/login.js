import { USER_TOKEN_EXPIRY_MS, USER_TOKEN_COOKIE } from '#common/constants.js'

export default async function login({ idNum, otpToken, otp }, { DL, utils, platform, setCookie }) {
    const storedOtp = await DL.Otp.readOne({ token: otpToken })
    if (!storedOtp || storedOtp.otp !== otp)
        throw { message: 'invalid OTP', status: 403 }

    let user

    if (storedOtp.payload) {
        user = await DL.User.create(storedOtp.payload)
    } else {
        user = await DL.User.readOne({ idNum })
        if (!user)
            throw { message: 'login failed', status: 403 }
    }

    const token = utils.auth.createToken(user.id, USER_TOKEN_EXPIRY_MS)
    const update = {
        lastLogin: new Date,
        [`tokens.${platform}`]: token
    }
    const updatedUser = await DL.User.updateOne({ id: user.id }, update, { select: DL.User.defaultSelect })

    await DL.redis.del(`user_auth:${user.id}`)
    await DL.Otp.deleteOne({ _id: storedOtp._id })
    setCookie(USER_TOKEN_COOKIE, token, USER_TOKEN_EXPIRY_MS)

    return {
        user: updatedUser,
        order: await utils.data.getUserOrder({ DL, _user: updatedUser })
    }
}

login.config = {
    auth: 'none',
    required: ['idNum', 'otpToken', 'otp']
}
