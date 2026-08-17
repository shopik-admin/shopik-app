export default async function choose(payload, { DL, _user, utils }) {
    const { DELIVERY_METHOD } = DL.Order.constants
    const { windowId } = payload
    const { deliveryMethod, pickupStoreId } = _user

    const windowDoc = await DL.OrderWindow.readById(windowId)
    if (!windowDoc) throw { status: 400, message: 'window not found' }

    const order = await utils.data.getUserOrder({ DL, _user })
    if (!order) throw { status: 400, message: 'no cart order found' }

    if (deliveryMethod === DELIVERY_METHOD.DELIVERY) {
        if (!order.storeId)
            throw { status: 400, message: 'no store assigned to order' }
        if (windowDoc.storeId !== order.storeId)
            throw { status: 400, message: 'window does not belong to order store' }
    }

    if (deliveryMethod === DELIVERY_METHOD.PICKUP && windowDoc.storeId !== pickupStoreId)
        throw { status: 400, message: 'window does not belong to pickup store' }

    const previousWindowId = order.window?.id || null
    if (previousWindowId === windowId)
        return order

    if (windowDoc.leadTimestamp < Date.now())
        throw { status: 400, message: 'window has passed' }

    const updatedWindow = await DL.OrderWindow.Model.findOneAndUpdate(
        { id: windowId, totalOrders: { $lt: windowDoc.maxCapacity } },
        { $inc: { totalOrders: 1 } },
        { returnDocument: 'after' }
    ).lean()

    if (!updatedWindow) throw { status: 409, message: 'window is at capacity' }

    const orderUpdate = {
        window: {
            ...windowDoc,
            reservedAt: new Date()
        }
    }

    try {
        const updatedOrder = await DL.Order.updateOne(
            { id: order.id },
            { $set: orderUpdate },
            { select: DL.Order.defaultSelect }
        )
        return updatedOrder
    } catch (err) {
        throw err
    } finally {
        if (previousWindowId) {
            await DL.OrderWindow.updateOne(
                { id: previousWindowId, totalOrders: { $gt: 0 } },
                { $inc: { totalOrders: -1 } }
            )
        }
    }
}

choose.config = {
    auth: 'required',
    required: ['windowId'],
    preventMultiple: ({ }, { _user }) => `:${_user.id}`
}