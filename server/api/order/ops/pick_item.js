import { constants as productConstants } from '#server/dl/schemas/product.js'

export default async function pick_item(payload, { DL, _admin, utils }) {
    const { id, barcode, action, finalAmount, missingReason, replacement } = payload
    if (!id || !barcode || !action) throw { status: 400, message: 'id, barcode, action required' }

    const order = await DL.Order.readById(id)
    if (!order) throw { status: 404, message: 'order not found' }
    if (order.status !== 'picking') throw { status: 400, message: 'order not in picking' }
    if (order.picker?.adminId !== _admin.id) throw { status: 403, message: 'not your order' }

    const idx = order.cart.findIndex(c => c.barcode === barcode)
    if (idx === -1) throw { status: 404, message: 'item not found' }

    const item = order.cart[idx]
    const isWeighted = item.unit?.type === productConstants.UNIT.WEIGHT || item.unit?.type === 'weight'

    const fullAdmin = await DL.Admin.readById(_admin.id)
    const adminName = `${_admin.name?.first ?? ''} ${_admin.name?.last ?? ''}`.trim()

    let update = {}
    let arrayFilters = [{ 'elem.barcode': barcode }]

    if (action === 'scan') {
        if (isWeighted) throw { status: 400, message: 'weighted items use weight action' }
        const amt = Number(finalAmount ?? item.amount)
        update = {
            $set: {
                'cart.$[elem].finalAmount': amt,
                'cart.$[elem].missing': false
            },
            $push: {
                'cart.$[elem].admins': { adminId: _admin.id, date: new Date(), amount: amt, status: 'scanned' }
            }
        }
    } else if (action === 'weight') {
        // weighted items have no scannable barcode — picker enters weighed amount
        const amt = Number(finalAmount)
        if (isNaN(amt) || amt < 0) throw { status: 400, message: 'valid finalAmount required' }
        update = {
            $set: {
                'cart.$[elem].finalAmount': amt,
                'cart.$[elem].missing': false
            },
            $push: {
                'cart.$[elem].admins': { adminId: _admin.id, date: new Date(), amount: amt, status: 'weighted' }
            }
        }
    } else if (action === 'missing') {
        update = {
            $set: {
                'cart.$[elem].missing': true,
                'cart.$[elem].missingReason': missingReason || 'missing',
                'cart.$[elem].finalAmount': 0
            },
            $push: {
                'cart.$[elem].admins': { adminId: _admin.id, date: new Date(), missing: true, status: 'missing' }
            }
        }
    } else if (action === 'replace') {
        // replacement: mark original as replaced, expect client to have added replacement line via separate flow
        // Here we mark the original item as missing/replaced
        const repBarcode = replacement?.replacementBarcode
        if (!repBarcode) throw { status: 400, message: 'replacementBarcode required' }
        update = {
            $set: {
                'cart.$[elem].missing': true,
                'cart.$[elem].missingReason': 'replaced',
                'cart.$[elem].finalAmount': 0,
                'cart.$[elem].replacement.replacementBarcode': repBarcode
            },
            $push: {
                'cart.$[elem].admins': { adminId: _admin.id, date: new Date(), status: 'replaced' }
            }
        }
        // If replacement item already exists in cart, set its originalBarcode pointer
        const repIdx = order.cart.findIndex(c => c.barcode === repBarcode)
        if (repIdx !== -1) {
            await DL.Order.Model.updateOne(
                { id },
                { $set: { [`cart.${repIdx}.replacement.originalBarcode`]: barcode } }
            )
        }
    } else {
        throw { status: 400, message: 'unknown action' }
    }

    const updated = await DL.Order.Model.findOneAndUpdate(
        { id },
        update,
        { new: true, arrayFilters }
    ).lean()

    // audit to pick_history
    try {
        await DL.PickHistory.create({
            orderId: id,
            storeId: order.storeId,
            adminId: _admin.id,
            adminName,
            barcode,
            productName: item.name,
            storageType: item.storageType,
            categoryId: item.category?.id,
            categoryPathIds: item.category?.pathIds,
            action,
            amount: item.amount,
            finalAmount: action === 'missing' ? 0 : (Number(finalAmount ?? item.amount)),
            replacedBarcode: action === 'replace' ? barcode : undefined,
            replacementBarcode: action === 'replace' ? replacement?.replacementBarcode : undefined,
            replacementReason: missingReason,
            pickedAt: new Date(),
            windowDate: order.window?.date,
            totalItems: order.cart.length
        })
    } catch {}

    return updated
}

pick_item.config = {
    permissions: ['order:pick'],
    preventMultiple: p => ':' + (p.id || '')
}
