import { ADMIN_TOKEN_EXPIRY_MS, ADMIN_TOKEN_COOKIE } from '#common/constants.js'
import verifyOtp from '#server/utils/auth/verifyOtp.js'
import rateLimit from '#server/utils/auth/rateLimit.js'

export default async function login({ idNum, otpToken, otp }, { DL, utils, platform, setCookie, ip }) {
    await rateLimit(DL, 'otp:verify:ip', ip, 30, 600)

    const admin = await DL.Admin.readOne({ idNum })
    if (!admin)
        throw { message: 'login failed', status: 403 }

    const storedOtp = await DL.Otp.readOne({ phone: admin.phone, token: otpToken })
    if (!await verifyOtp(DL, storedOtp, otp))
        throw { message: 'login failed', status: 403 }

    const token = utils.auth.createToken(admin.id, ADMIN_TOKEN_EXPIRY_MS)
    const update = {
        lastLogin: new Date,
        [`tokens.${platform}`]: token
    }
    const updatedAdmin = await DL.Admin.Model.findOneAndUpdate(
        { id: admin.id },
        update,
        { returnDocument: 'after' }
    ).select({
        _id: 0,
        id: 1,
        roleId: 1,
        tokens: 1,
        name: 1
    }).lean()

    await DL.redis?.set(`admin_auth:${admin.id}`, JSON.stringify(updatedAdmin), 'EX', 60 * 60 * 24)
    await DL.Otp.deleteOne({ _id: storedOtp._id })
    setCookie(ADMIN_TOKEN_COOKIE, token, ADMIN_TOKEN_EXPIRY_MS)
    return true
}

login.config = {
    auth: 'none',
    required: ['idNum', 'otpToken', 'otp']
}