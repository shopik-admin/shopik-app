import uid from '#common/functions/uid.js'

export default async function login_otp({ idNum }, { DL, external }) {
    const user = await DL.User.readOne({ idNum }, { phone: 1 })
    if (!user) throw { status: 400, message: 'invalid id number' }
    const { phone } = user
    const currentOtps = await DL.Otp.count({ phone })
    if (currentOtps >= 5) throw { status: 400, message: 'too many otps' }

    const token = uid()
    const otp = uid(6, true)
    await DL.Otp.create({ phone, token, otp })
    await external.sms.otp(phone, otp)

    return { token }
}

login_otp.config = { auth: 'none', required: ['idNum'] }
