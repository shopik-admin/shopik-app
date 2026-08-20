import diff from '#common/functions/diff.js'

export default async function add(payload, { DL, _user, utils }) {
    const couponCode = (payload.couponCode || '').trim().toLowerCase()
    if (!couponCode) throw { status: 400, message: 'coupon code is required' }

    const coupon = await DL.Coupon.readOne({ code: couponCode, active: true })
    if (!coupon) throw { status: 400, message: 'Coupon does not exist' }

    if (coupon.status !== 'active') throw { status: 400, message: 'Coupon is not active' }
    if (new Date() < coupon.start || new Date() > coupon.end) throw { status: 400, message: 'Coupon is expired or not yet valid' }

    let cartOrder = await utils.data.getUserOrder({ DL, _user })
    if (!cartOrder.cart) cartOrder.cart = []

    if (cartOrder.coupons?.some(c => c.code === couponCode)) throw { status: 400, message: 'Coupon already applied' }
    if (cartOrder.coupons && cartOrder.coupons.length > 0) throw { status: 400, message: 'Another coupon is already applied to this order' }

    const orderSum = cartOrder.sum || 0
    const sumNoCoupon = cartOrder.sumNoCoupon ?? orderSum

    const eligibilityResult = isCouponEligible(coupon, _user, orderSum)
    if (!eligibilityResult.eligible) throw { status: 400, message: 'Coupon conditions not met', details: { reason: eligibilityResult.reason } }

    const discount = calcOrderDiscount(coupon, orderSum)
    const finalSum = Math.max(orderSum - discount, 0)

    const couponEntry = {
        code: coupon.code,
        discount: Math.round(discount * 100) / 100,
        percent: coupon.benefit === 'percent',
        minSum: coupon.minSum,
        maxSum: coupon.maxSum,
        couponMessages: {
            sectionMessage: { text: coupon.description || coupon.name },
            checkOutMessage: {
                icon: 'coupon',
                title: coupon.name,
                text: `${coupon.benefit === 'percent' ? coupon.discount + '%' : coupon.discount.toFixed(2)} discount — ${coupon.description || ''}`.trim()
            }
        },
        checkOnPay: false
    }

    const updatedOrder = {
        ...cartOrder,
        coupons: [couponEntry],
        sum: orderSum,
        sumNoCoupon,
        finalSum,
        finalSumNoCoupon: sumNoCoupon,
        customerUpdatedAt: new Date()
    }

    const updateData = diff(cartOrder, updatedOrder)
    let finalOrder = cartOrder

    if (Object.keys(updateData).length > 0) {
        const savedOrder = await DL.Order.updateOne(
            { id: cartOrder.id },
            { $set: updateData }
        )
        if (savedOrder) finalOrder = savedOrder
    }

    return filterClientOrder(finalOrder)
}

function isCouponEligible(coupon, user, orderSum) {
    if (coupon.whitelist && coupon.whitelist.length > 0) {
        if (!coupon.whitelist.includes(user.id)) return { eligible: false, reason: 'not in whitelist' }
    }

    if (coupon.blacklist && coupon.blacklist.length > 0) {
        if (coupon.blacklist.includes(user.id)) return { eligible: false, reason: 'in blacklist' }
    }

    if (!coupon.dynamic) return { eligible: true }

    if (orderSum < coupon.minSum) return { eligible: false, reason: 'order sum below minimum' }

    if (coupon.condition) {
        if (coupon.condition.orderRange) {
            const { start: rangeStart, end: rangeEnd } = coupon.condition.orderRange
            if (orderSum < rangeStart || (rangeEnd !== undefined && orderSum > rangeEnd)) return { eligible: false, reason: 'order sum outside range' }
        }

        if (coupon.condition.lastOrder) {
            const { start: lastStart, end: lastEnd } = coupon.condition.lastOrder
            const userLastOrderDate = user.lastOrderDate
            if (!userLastOrderDate) return { eligible: false, reason: 'no previous orders' }
            if (lastStart && new Date(userLastOrderDate) < new Date(lastStart)) return { eligible: false, reason: 'last order too old' }
            if (lastEnd && new Date(userLastOrderDate) > new Date(lastEnd)) return { eligible: false, reason: 'last order too recent' }
        }

        if (coupon.condition.cities && coupon.condition.cities.length > 0) {
            const activeAddress = user.addresses?.find(a => a.active)
            if (!activeAddress || !coupon.condition.cities.includes(activeAddress.city)) return { eligible: false, reason: 'city not supported' }
        }

        if (coupon.condition.emails && coupon.condition.emails.length > 0) {
            if (!coupon.condition.emails.includes(user.email)) return { eligible: false, reason: 'email not allowed' }
        }

        if (coupon.condition.phones && coupon.condition.phones.length > 0) {
            if (!coupon.condition.phones.includes(user.phone)) return { eligible: false, reason: 'phone not allowed' }
        }
    }

    return { eligible: true }
}

function calcOrderDiscount(coupon, orderSum) {
    if (coupon.benefit === 'sum') {
        return Math.min(coupon.discount, orderSum)
    }
    if (coupon.benefit === 'percent') {
        const percentDiscount = orderSum * (coupon.discount / 100)
        if (coupon.maxSum !== undefined && coupon.maxSum !== null) {
            return Math.min(percentDiscount, coupon.maxSum)
        }
        return percentDiscount
    }
    return 0
}

function filterClientOrder(order) {
    if (!order) return null

    const filtered = {}
    for (const key of Object.keys(order)) {
        if (key.startsWith('admin') || key === 'adminNotes' || key === 'internalStatus') continue
        filtered[key] = order[key]
    }

    if (filtered.cart && Array.isArray(filtered.cart)) {
        filtered.cart = filtered.cart.map(item => {
            const clientItem = {}
            const allowedFields = ['id', 'barcode', 'name', 'amount', 'finalAmount', 'price', 'totalSum', 'regularSum', 'saleSum', 'saleIds', 'missing', 'replacedBy', 'unit']
            for (const key of Object.keys(item)) {
                if (key.startsWith('admin') || key.startsWith('internal')) continue
                if (allowedFields.includes(key)) {
                    clientItem[key] = item[key]
                }
            }
            return clientItem
        })
    }

    return filtered
}

add.config = {
    auth: 'required',
    required: ['couponCode']
}
