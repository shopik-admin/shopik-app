export default async function count(payload, { DL, _admin }) {
    // thin wrapper over list filter without pagination — reuse logic via ops/list internals would be duplication,
    // so we replicate filter building here lightweight
    const admin = await DL.Admin.readById(_admin.id)
    const me = _admin.id
    const isSuper = _admin.isSuperAdmin
    const canRead = _admin.hasPermission('order:read') || isSuper
    const canPick = _admin.hasPermission('order:pick') || isSuper
    const canShip = _admin.hasPermission('order:ship') || isSuper
    if (!canRead && !canPick && !canShip) throw { status: 403, message: 'Forbidden' }

    const filter = { active: true, status: { $ne: 'cart' } }
    if (canRead) {
        if (admin?.currentStoreId) filter.storeId = admin.currentStoreId
        else if (!isSuper && admin?.storeIds?.length) filter.storeId = { $in: admin.storeIds }
    } else {
        if (admin?.currentStoreId) filter.storeId = admin.currentStoreId
        else if (!isSuper && admin?.storeIds?.length) filter.storeId = { $in: admin.storeIds }
        const start = new Date(); start.setHours(0,0,0,0)
        const pad = n => String(n).padStart(2,'0')
        const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
        const today = fmt(start); const tom = new Date(start); tom.setDate(tom.getDate()+1); const tomStr = fmt(tom)
        filter['window.date'] = { $in: [today, tomStr] }
    }

    let permissionOr = null
    if (!canRead) {
        const or = []
        if (canPick) { or.push({ status: 'paid' }); or.push({ 'picker.adminId': me }); or.push({ status: 'picked', picker: null }); or.push({ status: 'picked', 'picker.adminId': null }); or.push({ status: 'picked', 'picker.adminId': { $exists: false } }) }
        if (canShip) { or.push({ status: 'packed' }); or.push({ 'shipper.adminId': me }) }
        permissionOr = or.length ? { $or: or } : null
    }
    const final = permissionOr ? (filter.$or ? { $and: [filter, permissionOr] } : { ...filter, ...permissionOr }) : filter
    return DL.Order.Model.countDocuments(final)
}

count.config = {
    permissions: ['order:read', 'order:pick', 'order:ship']
}
