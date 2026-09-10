import buildOpsFilter from '#server/utils/data/opsFilter.js'

export default async function list(payload, { DL, _admin }) {
    const {
        filter: extraFilter = {},
        limit = 25,
        skip = 0,
        sort,
        search
    } = payload || {}

    // Shared queue scoping (store, today/tomorrow, permission union) — see opsFilter.js.
    // If both base and extraFilter have storeId, extra wins — intentional for store picker.
    const { filter: finalFilter, perms: { me } } = await buildOpsFilter({
        DL,
        _admin,
        extraFilter,
        statusFilter: { $in: ['paid', 'picking', 'picked', 'packed', 'shipped'] }
    })

    const finalSort = sort || { 'window.endTimestamp': 1, 'window.startTimestamp': 1 }

    const select = {
        _id: 0,
        id: 1,
        number: 1,
        name: 1,
        phone: 1,
        email: 1,
        status: 1,
        deliveryMethod: 1,
        storeId: 1,
        storeName: 1,
        window: 1,
        picker: 1,
        shipper: 1,
        address: 1,
        cart: 1,
        bags: 1,
        boxes: 1,
        sum: 1,
        finalSum: 1,
        comment: 1,
        leaveOrderAtDoor: 1,
        shipmentId: 1,
        labels: 1,
        userOrderNumber: 1,
        shipperComment: 1,
        orderRestoredFrom: 1,
    }

    // search via DL layer if provided
    const readPayload = { ...finalFilter }
    const options = { sort: finalSort, skip, limit }
    if (search) options.search = search

    // Use raw Model for complex $or/$and that processFilter might strip — bypass read helper and use Model directly
    // But DL.Order.read will call processFilter which strips $or if not in filterFields. So we query Model directly.
    const Model = DL.Order.Model
    let query = finalFilter
    // Handle $and case from above
    const docs = await Model.find(query, { _id: 0, ...select })
        .sort(finalSort)
        .skip(Number(skip) || 0)
        .limit(Math.min(Number(limit) || 25, 100))
        .lean()

    // enrich cart items with product snapshot for old orders
    try {
        const { enrichOrders } = await import('#server/utils/data/enrichCart.js')
        await enrichOrders(docs, DL)
    } catch { }

    // Annotate isMine
    return docs.map(d => ({
        ...d,
        isMine: (d.picker?.adminId === me) || (d.shipper?.adminId === me)
    }))
}

list.config = {
    permissions: ['order:read', 'order:pick', 'order:ship']
}
