import diff from '#common/functions/diff.js'
import { calcOrderSum } from '#common/functions/calcOrder/index.js'
import { round2 } from '#common/functions/calcOrder/utils.js'

export default async function product(payload, { DL, _user, utils }) {
    const { id: productId, amount, unitKey } = payload

    if (typeof amount !== 'number' || amount < 0) {
        throw { status: 400, message: 'Amount must be >= 0' }
    }

    let cartOrder = await utils.data.getUserOrder({ DL, _user })
    if (!cartOrder.cart) cartOrder.cart = []

    const originalOrder = structuredClone(cartOrder)

    const product = await DL.Product.readOne(
        { id: productId, active: true, status: DL.Product.constants.STATUS.ACTIVE },
        DL.Product.defaultSelectOne
    )
    if (!product) {
        throw { status: 400, message: 'Product does not exist' }
    }

    if (amount === 0) {
        cartOrder.cart = cartOrder.cart.filter(item => item.barcode !== product.barcode && item.id !== product.id)
    } else {
        const domainPrice = cartOrder.domainId ? product.prices?.find(p => p.domainId === cartOrder.domainId)?.price : undefined
        const price = domainPrice ?? product.prices?.[0]?.price ?? product.price ?? 0

        const existingIndex = cartOrder.cart.findIndex(item => item.id === product.id)

        let option, unit, units
        if (unitKey) {
            unit = product?.unit
            option = unit?.options.find(o => o.key === unitKey) || null
            if (!option)
                throw { status: 400, message: 'Unit option does not exist' }
            units = amount
        }

        const calculatedAmount = option?.amount ? round2((units || 1) * option.amount) : amount

        const cartProduct = {
            id: product.id,
            name: product.name,
            barcode: product.barcode,
            amount: calculatedAmount,
            finalAmount: calculatedAmount,
            price,
            totalPrice: round2(calculatedAmount * price),
            status: existingIndex >= 0 ? cartOrder.cart[existingIndex].status : DL.Order.constants.CART_PRODUCT_STATUS.CLIENT_ADD,
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

        if (existingIndex >= 0) {
            cartOrder.cart[existingIndex] = cartProduct
        } else {
            cartOrder.cart.push(cartProduct)
        }
    }

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

    const newFinalSum = calcResult.totals.sum
    const newSumBeforeDiscounts = calcResult.totals.sumBeforeDiscounts

    const updatedOrder = {
        ...cartOrder,
        cart: cartOrder.cart,
        sales: calcResult.cartSaleDetails || salesMap,
        sum: newFinalSum,
        sumNoCoupon: newSumBeforeDiscounts,
        finalSum: newFinalSum,
        finalSumNoCoupon: newSumBeforeDiscounts,
        customerUpdatedAt: new Date()
    }

    const updateData = diff(originalOrder, updatedOrder)
    const nothingToUpdate = Object.keys(updateData).length === 0
    let finalOrder = cartOrder

    if (!nothingToUpdate) {
        const savedOrder = await DL.Order.updateOne(
            { id: cartOrder.id },
            { $set: updateData }
        )
        if (savedOrder) finalOrder = savedOrder
    }

    return { order: filterClientOrder(finalOrder) }
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

product.config = {
    auth: 'required',
    requiredFields: ['id', 'amount'],
    permission: null
}
