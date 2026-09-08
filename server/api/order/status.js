export default async function status({ orderNumber }, { DL, _user }) {
    if (!_user) throw { status: 401, message: 'Unauthorized' }
    if (!orderNumber) throw { status: 400, message: 'Missing orderNumber' }
    const order = await DL.Order.readOne(
        { number: String(orderNumber) },
        {
            _id: 0,
            id: 1,
            number: 1,
            status: 1,
            userId: 1,
            address: 1,
            deliveryMethod: 1,
            window: 1,
            storeId: 1,
            storeName: 1,
            cart: 1,
            sum: 1,
            sumWithShipping: 1,
            finalSum: 1,
            finalSumWithShipping: 1,
            payment: 1,
        }
    )
    if (!order) throw { status: 404, message: 'Order not found' }
    if (String(order.userId ?? '') && String(order.userId) !== String(_user.id))
        throw { status: 403, message: 'Not your order' }
    delete order.userId
    return { order }
}

status.config = {
    required: ['orderNumber'],
}