import diff from '#common/functions/diff.js'
import { calcOrder } from '#common/functions/calcOrder/cart.js'

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

    const allSaleIds = new Set()
    for (const saleId of product.saleIds || []) {
        allSaleIds.add(saleId)
    }
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

    const updatedOrder = calcOrder({ order: cartOrder, product, amount, unitKey, sales: salesMap })

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