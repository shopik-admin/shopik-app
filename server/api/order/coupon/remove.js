import diff from '#common/functions/diff.js'
import { calcOrderSum } from '#common/functions/calcOrder/index.js'
import { round2 } from '#common/functions/calcOrder/utils.js'

export default async function remove(payload, { DL, _user, utils }) {
    const couponCode = (payload.couponCode || '').trim().toLowerCase()
    if (!couponCode) throw { status: 400, message: 'coupon code is required' }

    let cartOrder = await utils.data.getUserOrder({ DL, _user })
    if (!cartOrder.cart) cartOrder.cart = []

    const originalCoupon = cartOrder.coupons?.find(c => c.code === couponCode)
    if (!originalCoupon) throw { status: 400, message: 'Coupon not found on this order' }

    const sumNoCoupon = cartOrder.sumNoCoupon || cartOrder.sum || 0

    const allSaleIds = new Set()
    for (const item of cartOrder.cart) {
        if (item.saleIds && Array.isArray(item.saleIds)) {
            for (const saleId of item.saleIds) {
                allSaleIds.add(saleId)
            }
        }
    }

    let activeSales = []
    if (allSaleIds.size > 0) {
        activeSales = await DL.Sale.read(
            { id: { $in: Array.from(allSaleIds) }, status: DL.Sale.constants.STATUS.ACTIVE },
            DL.Sale.defaultSelect,
            { limit: 0 }
        )
    }

    const salesMap = {}
    for (const sale of activeSales) {
        salesMap[sale.id] = sale
    }

    const calcResult = calcOrderSum({ cart: cartOrder.cart, sales: salesMap })

    for (let i = 0; i < cartOrder.cart.length; i++) {
        const calcProduct = calcResult.processedCart[i]
        if (!calcProduct) continue

        const cartItem = cartOrder.cart[i]

        cartItem.priceDistribution = (calcProduct.pricesDistribution || []).map(dist => ({
            type: dist.saleId ? 'sale' : 'regular',
            totalSum: round2(dist.sum ?? dist.totalSum ?? 0),
            amount: dist.amount,
            saleName: dist.saleName || dist.saleDescription || '',
            salePrice: dist.pricePerUnit ?? dist.salePrice ?? 0,
            saleLimit: dist.saleLimit,
            saleId: dist.saleId,
            saleKind: dist.saleKind,
            saleAmount: dist.saleAmount
        }))

        cartItem.priceDistribution.sort((a, b) => (b.salePrice || 0) - (a.salePrice || 0))

        let totalSum = 0
        let regularSum = 0
        let saleSum = 0
        const activeSaleIds = new Set()

        for (const dist of cartItem.priceDistribution) {
            totalSum += dist.totalSum
            if (dist.type === 'sale') {
                saleSum += dist.totalSum
                if (dist.saleId) activeSaleIds.add(dist.saleId)
            } else {
                regularSum += dist.totalSum
            }
        }

        cartItem.totalSum = round2(totalSum)
        cartItem.regularSum = round2(regularSum)
        cartItem.saleSum = round2(saleSum)
        cartItem.saleIds = Array.from(activeSaleIds)
    }

    const orderSum = calcResult.totals.sum
    const finalSum = Math.max(orderSum, 0)

    const updatedOrder = {
        ...cartOrder,
        cart: cartOrder.cart,
        sales: calcResult.cartSaleDetails || salesMap,
        coupons: [],
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
