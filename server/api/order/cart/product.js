import diff from '#common/functions/diff.js'
import { calcOrder } from '#common/functions/calcOrder/cart.js'
import filterClientOrder from '#server/utils/data/filterClientOrder.js'
import { getOrCreateGuestCart } from '#server/utils/data/getGuestCart.js'
import getShippingConfig from '#server/utils/data/getShippingConfig.js'

export default async function product(payload, { DL, _user, utils, cookies, setCookie }) {
    const { id: productId, amount, unitKey, domainId } = payload

    if (typeof amount !== 'number' || amount < 0) {
        throw { status: 400, message: 'Amount must be >= 0' }
    }

    // Enforce productMaxAmount (global per-product limit) from limits setting
    try {
        const limitsSetting = await DL.Setting.readOne({ key: 'limits' })
        const raw = limitsSetting?.value
        const max = Number(raw?.productMaxAmount ?? 0) || 0
        if (max > 0 && Number(amount) > max) {
            throw { status: 400, message: `Product max amount exceeded (max ${max})`, code: 'MAX_AMOUNT_EXCEEDED', max }
        }
    } catch (e) {
        if (e?.code === 'MAX_AMOUNT_EXCEEDED') throw e
        // ignore read errors, treat as no limit
    }

    let cartOrder
    if (_user?.id) {
        cartOrder = await utils.data.getUserOrder({ DL, _user })
    } else {
        cartOrder = await getOrCreateGuestCart({ cookies, DL, setCookie, domainId })
    }
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

    const shippingConfig = await getShippingConfig(DL, cartOrder.domainId || domainId)
    const updatedOrder = calcOrder({ order: cartOrder, product, amount, unitKey, sales: salesMap, shippingConfig, user: _user })

    const updateData = diff(originalOrder, updatedOrder)
    const nothingToUpdate = Object.keys(updateData).length === 0
    let finalOrder = cartOrder

    if (!nothingToUpdate) {
        const update = { $set: updateData }
        const savedOrder = _user?.id
            ? await DL.Order.updateOne({ id: cartOrder.id }, update)
            : await DL.GuestCart.updateOne({ id: cartOrder.id }, update)
        if (savedOrder) finalOrder = savedOrder
        else finalOrder = updatedOrder
    } else {
        finalOrder = updatedOrder
    }

    return { order: filterClientOrder(finalOrder), sales: salesMap }
}

product.config = {
    auth: 'lax',
    required: ['id', 'amount']
}