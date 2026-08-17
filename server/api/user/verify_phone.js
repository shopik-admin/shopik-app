import { USER_TOKEN_EXPIRY_MS, USER_TOKEN_COOKIE } from '#common/constants.js'

export default async function verify_phone({ otpToken, otp }, { DL, utils, platform, setCookie, _user }) {
    const storedOtp = await DL.Otp.readOne({
        token: otpToken,
        userId: _user.id
    })
    if (!storedOtp || storedOtp.otp !== otp)
        throw { message: 'invalid OTP', status: 403 }

    const user = await DL.User.readById(storedOtp.userId)
    if (!user) throw { message: 'user not found', status: 404 }

    try {
        await DL.User.updateOne({ id: storedOtp.userId }, { phone: storedOtp.phone })
    } catch (err) {
        throw { message: 'phone already in use', status: 409 }
    }


    const token = utils.auth.createToken(user.id, USER_TOKEN_EXPIRY_MS)
    const tokens = { [platform]: token }
    const updatedUser = await DL.User.updateOne(
        { id: user.id },
        {
            lastLogin: new Date(),
            tokens
        },
        { select: DL.User.defaultSelect }
    )

    await DL.redis.del(`user_auth:${user.id}`)
    setCookie(USER_TOKEN_COOKIE, token, USER_TOKEN_EXPIRY_MS)
    await DL.Otp.deleteOne({ _id: storedOtp._id })

    return updatedUser
}

verify_phone.config = { auth: 'required', required: ['otpToken', 'otp'] }
