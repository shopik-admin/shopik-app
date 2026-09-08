import resolveBotUser from '#server/utils/auth/resolveBotUser.js'

const STATUS_SELECT = {
    _id: 0,
    id: 1,
    number: 1,
    status: 1,
    window: 1,
    deliveryMethod: 1,
    storeName: 1,
    address: 1,
    finalSumWithShipping: 1,
    userId: 1
}

// Courier on the road vs. still handled at the branch (per dev spec §א:
// initial phase exposes only dispatched/in-branch + time window).
function dispatchState(status) {
    if (status === 'shipped' || status === 'done') return 'on_the_way'
    return 'at_branch'
}

/**
 * POST /api/bot/order_status
 * Auth: API key with `bot:order` permission (router enforces).
 * Body: { orderNumber, userToken }
 * - Ownership enforced: order.userId must equal the verified user.
 * - Returns dispatch state + time window only (no live GPS).
 */
export default async function order_status(payload, info) {
    const { DL, utils } = info
    const { orderNumber, userToken, phone, domainId } = payload || {}
    if (orderNumber == null) throw { status: 400, message: 'orderNumber required' }

    const user = await resolveBotUser({ DL, utils, domainId, userToken, phone })

    const full = await DL.Order.readOne({ number: orderNumber }, STATUS_SELECT)
    if (!full) throw { status: 404, message: 'Order not found' }
    if (String(full.userId) !== String(user.id))
        throw { status: 403, message: 'Not your order' }

    // Last status-change timeline entry (best effort, internal id only)
    let lastUpdate = null
    try {
        const [entry] = await DL.Timeline.read(
            { orderId: full.id, eventType: 'order_status' },
            { _id: 0, createdAt: 1, context: 1 },
            { sort: { createdAt: -1 }, limit: 1 }
        )
        lastUpdate = entry?.createdAt || null
    } catch { }

    // Explicit allowlist — internal ids (id, userId), shipmentId, window
    // internals (leadTimestamp etc.) and address internals (areaId, GPS)
    // never leave the server.
    return {
        number: full.number,
        status: full.status,
        dispatchState: dispatchState(full.status),
        window: full.window ? {
            date: full.window.date,
            start: full.window.start,
            end: full.window.end
        } : null,
        deliveryMethod: full.deliveryMethod,
        address: full.address ? {
            city: full.address.city,
            street: full.address.street,
            building: full.address.building
        } : null,
        finalSumWithShipping: full.finalSumWithShipping,
        lastUpdate
    }
}

order_status.config = {
    auth: 'none',
    permissions: ['bot:order'],
    required: ['orderNumber']
}
