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
        // Generic message: do not reveal whether the order exists.
        if (!order) throw { status: 404, message: 'Order not found or unavailable' }
        if (order.phone) {
            targetPhone = String(order.phone).trim()
        } else if (order.userId) {
            const owner = await DL.User.readById(order.userId, { _id: 0, phone: 1 })
            if (!owner?.phone) throw { status: 404, message: 'Order not found or unavailable' }
            targetPhone = String(owner.phone).trim()
        } else {
            throw { status: 404, message: 'Order not found or unavailable' }
        }
    }

    if (!targetPhone) throw { status: 400, message: 'phone or orderNumber required' }
    if (!regex.mobilePhone.test(targetPhone)) throw { status: 400, message: 'Invalid phone format' }

    const userFilter = domainId ? { domainId, phone: targetPhone } : { phone: targetPhone }
    const user = await DL.User.readOne(userFilter, { phone: 1 })
    // Generic message: do not reveal whether the user is registered.
    if (!user) throw { status: 400, message: 'Could not send a verification code' }

    const currentOtps = await DL.Otp.count({ phone: targetPhone })
    if (currentOtps >= 5) throw { status: 400, message: 'too many otps' }

    // Per-phone hourly cap (SMS-flood protection, IP-independent).
    // Fail-open when redis is unavailable.
    if (DL.redis) {
        try {
            const sendKey = `otp_send:${targetPhone}`
            const sent = await DL.redis.incr(sendKey)
            if (sent === 1) await DL.redis.expire(sendKey, 3600)
            if (sent > 10) throw { status: 400, message: 'too many otps' }
        } catch (e) {
            if (e?.status === 400) throw e
        }
    }

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
