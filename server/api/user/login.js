import { USER_TOKEN_EXPIRY_MS, USER_TOKEN_COOKIE, GUEST_CART_TOKEN_COOKIE } from '#common/constants.js'

export default async function login({ idNum, otpToken, otp }, { DL, utils, platform, setCookie, cookies, clearCookie }) {
    const storedOtp = await DL.Otp.readOne({ token: otpToken })
    if (!storedOtp || storedOtp.otp !== otp)
        throw { message: 'invalid OTP', status: 403 }

    let user

    if (storedOtp.payload) {
        user = await DL.User.create(storedOtp.payload)
    } else {
        user = await DL.User.readOne({ idNum })
        if (!user)
            throw { message: 'login failed', status: 403 }
    }

    const token = utils.auth.createToken(user.id, USER_TOKEN_EXPIRY_MS)
    const update = {
        lastLogin: new Date,
        [`tokens.${platform}`]: token
    }
    const updatedUser = await DL.User.updateOne({ id: user.id }, update, { select: DL.User.defaultSelect })

    await DL.redis?.del(`user_auth:${user.id}`)
    await DL.Otp.deleteOne({ _id: storedOtp._id })
    setCookie(USER_TOKEN_COOKIE, token, USER_TOKEN_EXPIRY_MS)

    let order = await utils.data.getUserOrder({ DL, _user: updatedUser })

    const guestToken = cookies?.[GUEST_CART_TOKEN_COOKIE]
    if (guestToken) {
        const guestCart = await DL.GuestCart.readOne({ id: guestToken, active: true })
        if (guestCart) {
            if (!order.cart?.length && guestCart.cart?.length) {
                const transfer = {
                    domainId: guestCart.domainId,
                    cart: guestCart.cart,
                    sales: guestCart.sales,
                    sum: guestCart.sum,
                    sumNoCoupon: guestCart.sumNoCoupon,
                    finalSum: guestCart.finalSum,
                    finalSumNoCoupon: guestCart.finalSumNoCoupon,
                    coupons: guestCart.coupons
                }
                const setData = Object.fromEntries(Object.entries(transfer).filter(([, v]) => v !== undefined))
                await DL.Order.updateOne({ id: order.id }, { $set: setData })
            }
            await DL.GuestCart.deleteOne({ id: guestToken })
        }
        clearCookie(GUEST_CART_TOKEN_COOKIE)
    }

    return {
        user: updatedUser,
        order: await utils.data.getUserOrder({ DL, _user: updatedUser })
    }
}

login.config = {
    auth: 'none',
    required: ['idNum', 'otpToken', 'otp']
}
