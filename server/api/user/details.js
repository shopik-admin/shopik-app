const ORDERS_SELECT = {
    _id: 0,
    id: 1,
    number: 1,
    status: 1,
    paid: 1,
    storeId: 1,
    storeName: 1,
    deliveryMethod: 1,
    window: 1,
    address: 1,
    time: 1,
    sum: 1,
    finalSum: 1,
    finalSumWithShipping: 1,
    productStorage: 1,
    bags: 1,
    cart: 1
}

const EMPTY_STATS = {
    ordersCount: 0,
    totalPaid: 0,
    refundedTotal: 0,
    canceledCount: 0,
    firstOrderAt: null,
    lastOrderAt: null,
    lastOrderId: null,
    lastOrderNumber: null
}

export default async function details({ id }, { DL }) {
    const user = await DL.User.readById(id)

    if (!user) throw { status: 404, message: 'user not found' }

    const userId = String(user.id || id)

    const [statsResult, ordersResult] = await Promise.allSettled([
        DL.UserStat.readOne({ userId }),

        DL.Order.read(
            { userId },
            ORDERS_SELECT,
            { sort: { time: -1 }, limit: 50 }
        )
    ])

    const stats =
        statsResult.status === 'fulfilled'
            ? statsResult.value
            : null

    let orders = []

    if (ordersResult.status === 'fulfilled') {
        orders = (ordersResult.value || []).map(order => {
            const cart = Array.isArray(order.cart) ? order.cart : []

            let handled = 0

            for (const p of cart) {
                if (p.finalAmount != null || p.missing) {
                    handled++
                }
            }

            const { cart: _dropped, ...rest } = order

            return {
                ...rest,
                pickProgress: {
                    handled,
                    total: cart.length
                }
            }
        })
    }

    return {
        user,
        stats: stats || { ...EMPTY_STATS, userId },
        orders
    }
}
details.config = {
    required: ['id'],
    permissions: ['user:read']
}
