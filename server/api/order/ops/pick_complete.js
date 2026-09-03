import { calcOrderSum } from '#common/functions/calcOrder/index.js'
import { applyCalcToCart } from '#common/functions/calcOrder/cart.js'

export default async function pick_complete(payload, { DL, _admin, utils }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'id required' }

    const order = await DL.Order.readById(id)
    if (!order) throw { status: 404, message: 'order not found' }
    if (order.status !== 'picking') throw { status: 400, message: 'order not in picking' }
    if (order.picker?.adminId !== _admin.id) throw { status: 403, message: 'not your order' }

    const unhandled = order.cart.filter(c => c.finalAmount == null && !c.missing)
    if (unhandled.length)
        throw { status: 400, message: `unhandled items: ${unhandled.map(u => u.barcode).join(', ')}` }

    // pricing recalc — reuse engine so missing/replaced originals get finalAmount 0
    const cartClone = JSON.parse(JSON.stringify(order.cart))
    for (const item of cartClone) {
        if (item.missing) {
            item.replacedBy = item.replacement?.replacementBarcode || item.missingReason === 'replaced' ? item.replacement?.replacementBarcode : undefined
        }
        if (item.replacement?.replacementBarcode && item.missing) {
            item.replacedBy = item.replacement.replacementBarcode
        }
    }

    const allSaleIds = [...new Set(cartClone.flatMap(c => c.saleIds || []))]
    let salesMap = {}
    if (allSaleIds.length) {
        const sales = await DL.Sale.read({ id: { $in: allSaleIds } })
        salesMap = Object.fromEntries((sales || []).map(s => [s.id, s]))
    }

    let calcResult
    try {
        calcResult = calcOrderSum({ cart: cartClone, sales: salesMap })
    } catch (e) {
        throw { status: 500, message: 'pricing failed: ' + (e.message || e) }
    }

    const withPricing = applyCalcToCart ? (() => {
        try { return applyCalcToCart({ cart: cartClone, calcResult }) } catch { return cartClone }
    })() : cartClone

    // map engine totals back to order
    const totals = calcResult.totals || {}
    const sum = totals.sum ?? order.sum
    const finalSum = totals.sum ?? order.finalSum

    // coupon re-apply: keep coupons as-is, clamp finalSum = max(sum - discount, 0)
    let finalSumAdjusted = finalSum
    if (order.coupons?.length) {
        const discount = order.coupons.reduce((acc, c) => acc + (Number(c.discount) || 0), 0)
        finalSumAdjusted = Math.max(Number(finalSum) - discount, 0)
    }

    for (let i = 0; i < withPricing.length; i++) {
        if (withPricing[i].priceDistribution) {
            cartClone[i].priceDistribution = withPricing[i].priceDistribution
            cartClone[i].totalSum = withPricing[i].totalSum
            cartClone[i].regularSum = withPricing[i].regularSum
            cartClone[i].saleSum = withPricing[i].saleSum
        }
    }

    const updated = await DL.Order.Model.findOneAndUpdate(
        { id, status: 'picking' },
        {
            $set: {
                cart: cartClone,
                status: 'picked',
                pickEnd: new Date(),
                sum,
                finalSum: finalSumAdjusted,
                finalSumNoCoupon: sum
            }
        },
        { new: true }
    ).lean()

    if (!updated) throw { status: 409, message: 'status changed' }

    try {
        await DL.Owner.updateOne({ orderId: id, adminId: _admin.id, type: 'picking', status: 'active' }, { status: 'done', end: new Date() })
    } catch {}
    try {
        await DL.PickHistory.create({
            orderId: id, storeId: order.storeId, adminId: _admin.id,
            adminName: `${_admin.name?.first ?? ''} ${_admin.name?.last ?? ''}`.trim(),
            action: 'complete', barcode: 'ORDER', pickedAt: new Date(), windowDate: order.window?.date, totalItems: order.cart.length, pickStart: order.pickStart, pickEnd: new Date()
        })
    } catch {}

    try {
        const { record, adminActor } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.ORDER_STATUS_UPDATE,
            actor: adminActor(_admin),
            changes: { oldData: { status: 'picking' }, newData: { status: 'picked' } },
            context: { step: 'pick_complete', cartSize: order.cart.length },
            metadata: { source: 'order/ops/pick_complete' }
        })
    } catch {}

    return updated
}

pick_complete.config = {
    permissions: ['order:pick']
}
