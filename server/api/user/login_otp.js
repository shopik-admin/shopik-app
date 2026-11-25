import uid from '#common/functions/uid.js'
import toRemember from '#common/functions/toRemember.js'

export default async function login_otp({ phone, remember, domainId, channel }, { DL, external }) {
    const user = await DL.User.readOne({ phone }, { phone: 1 })
    // Deliberately explicit: the login screen points unregistered users to
    // registration. (This does reveal whether a number has an account.)
    if (!user) throw { status: 400, message: 'login_user_not_registered' }
    const currentOtps = await DL.Otp.count({ phone })
    if (currentOtps >= 5) throw { status: 400, message: 'otp_too_many_requests' }

    // Per-phone hourly cap (SMS-flood protection, IP-independent).
    // Fail-open when redis is unavailable.
    if (DL.redis) {
        try {
            const sendKey = `otp_send:${phone}`
            const sent = await DL.redis.incr(sendKey)
            if (sent === 1) await DL.redis.expire(sendKey, 3600)
            if (sent > 10) throw { status: 400, message: 'otp_too_many_requests' }
        } catch (e) {
            if (e?.status === 400) throw e
        }
    }

    const token = uid()
    const otp = uid(6, true)
    await DL.Otp.create({ phone, token, otp, remember: toRemember(remember) })
    await external.sms.otp(phone, otp, { domainId, voice: channel === 'voice' ? 'call' : true })

    return { token }
}

login_otp.config = { auth: 'none', required: ['phone'] }
