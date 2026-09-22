import uid from '#common/functions/uid.js'

export default async function login_otp({ idNum, domainId }, { DL, external, validators }) {
    await validators.idNum(idNum, arguments[1])
    const admin = await DL.Admin.readOne({ idNum })
    // Generic message: do not reveal whether the ID is valid.
    if (!admin)
        throw { status: 400, message: 'Could not send a verification code' }

    const currentOtps = await DL.Otp.count({ phone: admin.phone })
    if (currentOtps >= 5)
        throw { status: 400, message: 'too many otps' }

    // Per-phone hourly cap (SMS-flood protection, IP-independent).
    // Fail-open when redis is unavailable.
    if (DL.redis) {
        try {
            const sendKey = `otp_send:${admin.phone}`
            const sent = await DL.redis.incr(sendKey)
            if (sent === 1) await DL.redis.expire(sendKey, 3600)
            if (sent > 10) throw { status: 400, message: 'too many otps' }
        } catch (e) {
            if (e?.status === 400) throw e
        }
    }

    const token = uid()
    const otp = uid(6, true)
    await DL.Otp.create({
        phone: admin.phone,
        token,
        otp
    })
    await external.sms.otp(admin.phone, otp, { domainId })

    return { token }
}

login_otp.config = {
    auth: 'none',
    required: ['idNum']
}