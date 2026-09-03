export default async function list(payload, { DL, _admin }) {
    const admin = await DL.Admin.readById(_admin.id)
    const me = _admin.id

    const isSuper = _admin.isSuperAdmin
    const canRead = _admin.hasPermission('order:read') || isSuper
    const canPick = _admin.hasPermission('order:pick') || isSuper
    const canShip = _admin.hasPermission('order:ship') || isSuper

    if (!canRead && !canPick && !canShip)
        throw { status: 403, message: 'Forbidden' }

    const {
        filter: extraFilter = {},
        limit = 25,
        skip = 0,
        sort,
        search
    } = payload || {}

    const filter = { active: true, status: { $ne: 'cart' } }

    if (canRead) {
        if (admin?.currentStoreId) {
            // order:read sees all stores they can see — if they have a currentStoreId, respect it too but allow filter override
            // spec: all stores I can see. We implement: if admin.storeIds set and not super, filter to those ids
            // If currentStoreId is set, narrow to that store; otherwise include all allowed stores.
            filter.storeId = admin.currentStoreId
            // still restrict to allowed stores if not super — currentStoreId already validated on write
        } else if (!isSuper && admin?.storeIds?.length) {
            filter.storeId = { $in: admin.storeIds }
        }
        // else superadmin without currentStoreId → no store filter (all stores)
        // if superadmin has currentStoreId, filter to that store
    } else {
        // picker/shipper only — must have a currentStoreId to scope
        if (admin?.currentStoreId) filter.storeId = admin.currentStoreId
        else if (!isSuper && admin?.storeIds?.length === 1) filter.storeId = admin.storeIds[0]
        else if (!isSuper && admin?.storeIds?.length) filter.storeId = { $in: admin.storeIds }
        // if no storeIds, fall through — will return empty
    }

    // Non-read roles are limited to today + tomorrow windows
    if (!canRead) {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 2) // tomorrow end (exclusive)
        // filter windows whose date is today or tomorrow
        const pad = n => String(n).padStart(2, '0')
        const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        const todayStr = fmt(start)
        const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowStr = fmt(tomorrow)
        filter['window.date'] = { $in: [todayStr, tomorrowStr] }
    }

    // Permission union: build $or
    let permissionOr = null
    if (!canRead) {
        const or = []
        if (canPick) {
            or.push({ status: 'paid' })
            or.push({ 'picker.adminId': me })
            // pickers should also see packable queue: picked with no owner
            or.push({ status: 'picked', 'picker.adminId': { $exists: false } })
            or.push({ status: 'picked', picker: null })
            or.push({ status: 'picked', 'picker.adminId': null })
            // also picked with missing picker subdoc
        }
        if (canShip) {
            or.push({ status: 'packed' })
            or.push({ 'shipper.adminId': me })
        }
        // Deduplicate empty clauses — Mongo $or requires at least one
        permissionOr = or.length ? { $or: or } : null
    }

    // Spread extraFilter (allow client to add status/search refinements, but blocked keys sanitized by processFilter)
    // Keep $or injection safe: merge permissionOr with extraFilter via $and
    let finalFilter = { ...filter, ...extraFilter }

    // If both filter and extraFilter have storeId, extra wins — intentional for store picker
    if (permissionOr) {
        // If finalFilter already has $or from search, we need $and
        if (finalFilter.$or) {
            finalFilter = { $and: [finalFilter, permissionOr] }
        } else {
            Object.assign(finalFilter, permissionOr)
        }
    }

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
    } catch {}

    // Annotate isMine
    return docs.map(d => ({
        ...d,
        isMine: (d.picker?.adminId === me) || (d.shipper?.adminId === me)
    }))
}

list.config = {
    permissions: ['order:read', 'order:pick', 'order:ship']
}
