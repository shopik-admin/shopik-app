import diff from '#common/functions/diff.js'

export default async function remove(payload, { DL, _user, utils }) {
    const couponCode = (payload.couponCode || '').trim().toLowerCase()
    if (!couponCode) throw { status: 400, message: 'coupon code is required' }

    let cartOrder = await utils.data.getUserOrder({ DL, _user })
    if (!cartOrder.cart) cartOrder.cart = []

    const originalCoupon = cartOrder.coupons?.find(c => c.code === couponCode)
    if (!originalCoupon) throw { status: 400, message: 'Coupon not found on this order' }

    const orderSum = cartOrder.sum || 0
    const sumNoCoupon = cartOrder.sumNoCoupon ?? orderSum

    const updatedOrder = {
        ...cartOrder,
        coupons: [],
        sum: orderSum,
        sumNoCoupon,
        finalSum: orderSum,
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

remove.config = {
    auth: 'required',
    required: ['couponCode']
}
