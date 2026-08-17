const MAX_DIST_FROM_STORE_KM = 10

export async function findClosestStore(address, DL) {
    const store = await DL.Store.Model.findOne({
        'address.location': {
            $nearSphere: {
                $geometry: address.location,
                $maxDistance: MAX_DIST_FROM_STORE_KM * 1000
            }
        }
    }, { _id: 0, id: 1 }).lean()

    return store?.id ?? null
}

export async function updateOrderAddress({ DL, address, order, select = DL.Order.defaultSelect }) {
    const update = { address }
    const { DELIVERY_METHOD } = DL.Order.constants
    if (order.deliveryMethod === DELIVERY_METHOD.DELIVERY) {
        const storeId = await findClosestStore(address, DL)
        if (storeId)
            update.storeId = storeId
        update.address.hasService = Boolean(storeId)
    }

    const updatedOrder = await DL.Order.updateOne({ id: order.id }, update, { select })
    return updatedOrder
}

export default async function update(payload, { DL }) {
    const { address, id } = payload
    const order = await DL.Order.readById(id)
    return updateOrderAddress({ DL, address, order, select: { _id: 0 } })
}

update.config = {
    permissions: ['order:update']
}
