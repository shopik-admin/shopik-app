import diff from '#common/functions/diff.js'
import { calcOrder } from '#common/functions/calcOrder/cart.js'
import { annotateProduct, getRuleUsage, validateCart } from '#common/functions/productRules.js'
import filterClientOrder from '#server/utils/data/filterClientOrder.js'
import getProductRules from '#server/utils/data/getProductRules.js'
import { getOrCreateGuestCart } from '#server/utils/data/getGuestCart.js'
import getShippingConfig from '#server/utils/data/getShippingConfig.js'
import { withDomainPriceOne } from '#server/utils/data/withDomainPrice.js'

export default async function product(payload, { DL, _user, utils, cookies, setCookie }) {
    const { id: productId, amount, unitKey, domainId } = payload

    if (typeof amount !== 'number' || amount < 0) {
        throw { status: 400, message: 'Amount must be >= 0' }
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

    const effectiveDomainId = cartOrder.domainId || domainId

    // Limits are per domain; this used to read an arbitrary domain's row.
    let productMaxAmount = 0
    try {
        const limitsSetting = await DL.Setting.readOne(
            { key: 'limits', domainId: effectiveDomainId },
            { _id: 0, value: 1 }
        )
        productMaxAmount = Number(limitsSetting?.value?.productMaxAmount ?? 0) || 0
    } catch {
        // ignore read errors, treat as no per-product limit
    }

    // Global product rules: overrides the stepper and tags the line with the
    // cap groups it belongs to. Validation happens on the rebuilt cart below.
    const rules = await getProductRules(DL)
    const annotatedProduct = annotateProduct(product, rules.groups)

    // Single price source: resolve the order domain's flat `price` here so
    // calcOrder/buildCartProduct never touch the multi-domain `prices` array.
    // (cartOrder.domainId is server-stored; payload domainId is router-resolved.)
    const pricedProduct = withDomainPriceOne(annotatedProduct, effectiveDomainId)
    if (!pricedProduct) {
        throw { status: 400, message: 'product not available in this domain' }
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

    const shippingConfig = await getShippingConfig(DL, effectiveDomainId)
    const updatedOrder = calcOrder({ order: cartOrder, product: pricedProduct, amount, unitKey, sales: salesMap, shippingConfig, user: _user })

    // Enforce the per-product cap on the calculated line (unit options can
    // change the amount), then the shared group caps on the whole cart.
    const candidateLine = updatedOrder.cart.find(item => item.id === product.id)
    if (productMaxAmount > 0 && Number(candidateLine?.amount) > productMaxAmount) {
        throw {
            status: 400,
            code: 'MAX_AMOUNT_EXCEEDED',
            message: `Product max amount exceeded (max ${productMaxAmount})`,
            max: productMaxAmount
        }
    }

    // Customer cart edits count every line (including ops-added ones) so the
    // visible cart cannot sit above a cap. Ops flows bypass this endpoint.
    // Only edits that raise usage are blocked: decrementing/removing a line
    // must stay possible even when the cart already sits over a tightened cap.
    const violations = validateCart(updatedOrder.cart, rules.groups, { includeAdminLines: true })
        .filter(violation => {
            const rule = rules.groups.find(item => item.id === violation.ruleId)
            const previousUsage = getRuleUsage(originalOrder.cart, rule)
            return violation.usage > previousUsage + 1e-9
        })
    if (violations.length) {
        const violation = violations[0]
        throw {
            status: 400,
            code: 'GROUP_LIMIT_EXCEEDED',
            message: `Product group limit exceeded (${violation.ruleName} max ${violation.max})`,
            groupId: violation.ruleId,
            groupName: violation.ruleName,
            max: violation.max,
            usage: violation.usage
        }
    }

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