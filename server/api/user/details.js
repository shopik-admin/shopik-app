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
    let stats = null
    try {
        stats = await DL.UserStat.readOne({ userId })
    } catch { }

    let orders = []
    try {
        const rows = await DL.Order.read({ userId }, ORDERS_SELECT, { sort: { time: -1 }, limit: 50 })
        // Same handled/total inputs the Ops card uses for its progress gauge,
        // computed server-side so the full cart isn't sent to the client.
        orders = (rows || []).map(order => {
            const cart = Array.isArray(order.cart) ? order.cart : []
            const handled = cart.filter(p => p.finalAmount != null || !!p.missing).length
            const { cart: _dropped, ...rest } = order
            return { ...rest, pickProgress: { handled, total: cart.length } }
        })
    } catch { }

    return { user, stats: stats || { ...EMPTY_STATS, userId }, orders }
}

details.config = {
    required: ['id'],
    permissions: ['user:read']
}
