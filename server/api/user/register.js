import uid from '#common/functions/uid.js'

export default async function register(payload, { DL, utils, external }) {
    const name = utils.extractFields.getName(payload)
    if (name) payload.name = name

    const allowed = ['idNum', 'phone', 'name', 'email', 'getOffers', 'domainId']
    const domainId = payload.domainId
    const filtered = {}
    for (const key of allowed) {
        if (payload[key] !== undefined) filtered[key] = payload[key]
    }

    const existingPhone = await DL.User.count({ phone: filtered.phone })
    if (existingPhone)
        throw { status: 409, message: 'phone already registered' }

    const existingIdNum = await DL.User.count({ idNum: filtered.idNum })
    if (existingIdNum)
        throw { status: 409, message: 'id number already registered' }

    const token = uid()
    const otp = uid(6, true)
    await DL.Otp.create({
        phone: filtered.phone,
        token,
        otp,
        payload: filtered
    })
    await external.sms.otp(filtered.phone, otp, { domainId })

    return { user: filtered, token }
}

register.config = { auth: 'none', required: ['idNum', 'phone'] }
