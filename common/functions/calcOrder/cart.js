import { calcOrderSum } from './index.js'
import { round2 } from './utils.js'

export const CART_PRODUCT_STATUS = {
    ADMIN_ADD: 'admin_add',
    CLIENT_ADD: 'client_add'
}

export function buildCartProduct({ product, amount, unitKey, domainId, existingStatus }) {
    const domainPrice = domainId ? product.prices?.find(p => p.domainId === domainId)?.price : undefined
    const price = domainPrice ?? product.prices?.[0]?.price ?? product.price ?? 0

    let option, unit, units
    if (unitKey) {
        unit = product?.unit
        option = unit?.options.find(o => o.key === unitKey) || null
        if (!option)
            throw { status: 400, message: 'Unit option does not exist' }
        units = amount
    }

    const calculatedAmount = option?.amount ? round2((units || 1) * option.amount) : amount

    return {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        amount: calculatedAmount,
        finalAmount: calculatedAmount,
        price,
        totalPrice: round2(calculatedAmount * price),
        status: existingStatus || CART_PRODUCT_STATUS.CLIENT_ADD,
        saleIds: product.saleIds || [],
        priceDistribution: [],
        missing: false,
        unit: {
            type: unit?.type || 'item',
            baseUnit: unit?.baseUnit || 'unit',
            units,
            option
        },
        updatedAt: new Date()
    }
}

export function applyCalcToCart({ cart, calcResult }) {
    for (let i = 0; i < cart.length; i++) {
        const calcProduct = calcResult.processedCart[i]
        if (!calcProduct) continue

        const cartItem = cart[i]

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

        // Sort priceDistribution so higher unit prices are placed FIRST for refund priority
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
        cartItem.updatedAt = new Date()
    }

    return cart
}

export function calcOrder({ order, product, amount, unitKey, sales }) {
    let cart = (order.cart || []).map(item => ({ ...item }))

    if (amount === 0) {
        cart = cart.filter(item => item.id !== product.id)
    } else {
        const existingIndex = cart.findIndex(item => item.id === product.id)
        const cartProduct = buildCartProduct({
            product,
            amount,
            unitKey,
            domainId: order.domainId,
            existingStatus: existingIndex >= 0 ? cart[existingIndex].status : undefined
        })

        if (existingIndex >= 0) {
            cart[existingIndex] = cartProduct
        } else {
            cart.push(cartProduct)
        }
    }

    const calcResult = calcOrderSum({ cart, sales: sales || {} })
    applyCalcToCart({ cart, calcResult })

    return {
        ...order,
        cart,
        sales: calcResult.cartSaleDetails || sales,
        sum: calcResult.totals.sum,
        sumNoCoupon: calcResult.totals.sumBeforeDiscounts,
        finalSum: calcResult.totals.sum,
        finalSumNoCoupon: calcResult.totals.sumBeforeDiscounts,
        customerUpdatedAt: new Date()
    }
}

export default calcOrder