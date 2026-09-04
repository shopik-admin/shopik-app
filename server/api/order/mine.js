export default async function mine(payload, { DL, _user }) {
    if (!_user) throw { status: 401, message: 'Unauthorized' }
    const { limit = 20, skip = 0, sort } = payload || {}
    const filter = { userId: _user.id, status: { $ne: 'cart' } }
    const finalSort = sort || { time: -1, _id: -1 }
    const select = {
        _id: 0,
        id: 1,
        number: 1,
        status: 1,
        time: 1,
        window: 1,
        address: 1,
        deliveryMethod: 1,
        storeId: 1,
        storeName: 1,
        cart: 1,
        sum: 1,
        sumWithShipping: 1,
        finalSum: 1,
        finalSumWithShipping: 1,
        shipping: 1,
        finalShipping: 1,
        payment: 1,
    }
    const Model = DL.Order.Model
    const docs = await Model.find(filter, select)
        .sort(finalSort)
        .skip(Math.max(0, Number(skip) || 0))
        .limit(Math.min(Math.max(1, Number(limit) || 20), 50))
        .lean()
    return docs
}

mine.config = {
    auth: 'required',
}
