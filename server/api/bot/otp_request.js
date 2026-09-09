import uid from '#common/functions/uid.js'
import regex from '#common/functions/regex.js'

/**
 * POST /api/bot/otp_request
 * Auth: API key with `bot:otp` permission (router enforces).
 * Body: { phone } OR { orderNumber }
 * - phone: send OTP to that phone (must belong to an existing user).
 * - orderNumber: resolve the order, send OTP to the phone stored on the
 *   order / owning user (never to an arbitrary typed-in phone).
 * Returns: { otpToken }
 */
export default async function otp_request(payload, { DL, external }) {
    const { phone, orderNumber, domainId } = payload || {}

    let targetPhone = (phone || '').trim()

    if (!targetPhone && orderNumber != null) {
        const order = await DL.Order.readOne(
            { number: orderNumber },
            { _id: 0, id: 1, phone: 1, userId: 1 }
        )
        if (!order) throw { status: 404, message: 'Order not found' }
        if (order.phone) {
            targetPhone = String(order.phone).trim()
        } else if (order.userId) {
            const owner = await DL.User.readById(order.userId, { _id: 0, phone: 1 })
            if (!owner?.phone) throw { status: 404, message: 'No phone on file for this order' }
            targetPhone = String(owner.phone).trim()
        } else {
            throw { status: 404, message: 'No phone on file for this order' }
        }
    }

    if (!targetPhone) throw { status: 400, message: 'phone or orderNumber required' }
    if (!regex.mobilePhone.test(targetPhone)) throw { status: 400, message: 'Invalid phone format' }

    const userFilter = domainId ? { domainId, phone: targetPhone } : { phone: targetPhone }
    const user = await DL.User.readOne(userFilter, { phone: 1 })
    if (!user) throw { status: 400, message: 'user not found' }

    const currentOtps = await DL.Otp.count({ phone: targetPhone })
    if (currentOtps >= 5) throw { status: 400, message: 'too many otps' }

    const token = uid()
    const otp = uid(6, true)
    await DL.Otp.create({ phone: targetPhone, token, otp })
    await external.sms.otp(targetPhone, otp, { domainId })

    return { otpToken: token }
}

otp_request.config = {
    auth: 'none',
    permissions: ['bot:otp']
}
