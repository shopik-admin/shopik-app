import uid from '#common/functions/uid.js'

export default async function login_otp({ idNum, domainId }, { DL, external }) {
    const admin = await DL.Admin.readOne({ idNum })
    if (!admin)
        throw { status: 400, message: 'invalid id number' }

    const currentOtps = await DL.Otp.count({ phone: admin.phone })
    if (currentOtps >= 5)
        throw { status: 400, message: 'too many otps' }

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