import { USER_TOKEN_EXPIRY_MS } from '#common/constants.js'

/**
 * POST /api/bot/otp_verify
 * Auth: API key with `bot:otp` permission (router enforces).
 * Body: { phone, otpToken, otp }
 * Verifies the OTP issued by bot/otp_request and returns a userToken
 * the bot must send on every subsequent bot/* call (per dev spec).
 * Returns: { userToken, userId }
 */
export default async function otp_verify(payload, { DL, utils }) {
    const { phone, otpToken, otp, domainId } = payload || {}
    if (!phone || !otpToken || !otp) throw { status: 400, message: 'phone, otpToken and otp required' }

    const storedOtp = await DL.Otp.readOne({ token: otpToken })
    if (!storedOtp || storedOtp.otp !== otp || String(storedOtp.phone) !== String(phone))
        throw { message: 'invalid OTP', status: 403 }

    const userFilter = domainId ? { domainId, phone } : { phone }
    const user = await DL.User.readOne(userFilter)
    if (!user) throw { message: 'login failed', status: 403 }

    const userToken = utils.auth.createToken(user.id, USER_TOKEN_EXPIRY_MS)
    await DL.User.updateOne(
        { id: user.id },
        { lastLogin: new Date(), [`tokens.bot`]: userToken }
    )
    try { await DL.redis?.del(`user_auth:${user.id}`) } catch { }
    try { await DL.Otp.deleteOne({ _id: storedOtp._id }) } catch { }

    return { userToken, userId: user.id }
}

otp_verify.config = {
    auth: 'none',
    required: ['phone', 'otpToken', 'otp'],
    permissions: ['bot:otp']
}
