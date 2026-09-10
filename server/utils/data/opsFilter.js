// Shared filter builder for the ops order queue (order/ops/list, order/ops/count).
// Keeps store scope, today/tomorrow window limits and the permission union in one place
// so the two endpoints cannot drift apart (e.g. tab badges vs tab lists).
export default async function buildOpsFilter({ DL, _admin, extraFilter = {}, statusFilter }) {
    const admin = await DL.Admin.readById(_admin.id)
    const me = _admin.id

    const isSuper = _admin.isSuperAdmin
    const canRead = _admin.hasPermission('order:read') || isSuper
    const canPick = _admin.hasPermission('order:pick') || isSuper
    const canShip = _admin.hasPermission('order:ship') || isSuper

    if (!canRead && !canPick && !canShip)
        throw { status: 403, message: 'Forbidden' }

    const filter = { active: true, status: statusFilter }

    if (canRead) {
        if (admin?.currentStoreId) {
            filter.storeId = admin.currentStoreId
        } else if (!isSuper && admin?.storeIds?.length) {
            filter.storeId = { $in: admin.storeIds }
        }
    } else {
        // picker/shipper only — must have a currentStoreId to scope
        if (admin?.currentStoreId) filter.storeId = admin.currentStoreId
        else if (!isSuper && admin?.storeIds?.length === 1) filter.storeId = admin.storeIds[0]
        else if (!isSuper && admin?.storeIds?.length) filter.storeId = { $in: admin.storeIds }
        // Non-read roles are limited to today + tomorrow windows
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const pad = n => String(n).padStart(2, '0')
        const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        const todayStr = fmt(start)
        const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1)
        filter['window.date'] = { $in: [todayStr, fmt(tomorrow)] }
    }

    let permissionOr = null
    if (!canRead) {
        const or = []
        if (canPick) {
            or.push({ status: 'paid' })
            or.push({ 'picker.adminId': me })
            or.push({ status: 'picked', 'picker.adminId': { $exists: false } })
            or.push({ status: 'picked', picker: null })
            or.push({ status: 'picked', 'picker.adminId': null })
        }
        if (canShip) {
            or.push({ status: 'packed' })
            or.push({ 'shipper.adminId': me })
        }
        permissionOr = or.length ? { $or: or } : null
    }

    // Spread extraFilter (e.g. per-tab filters), keep $or injection safe via $and
    const finalFilter = { ...filter, ...extraFilter }
    let final
    if (permissionOr) {
        if (finalFilter.$or) final = { $and: [finalFilter, permissionOr] }
        else final = { ...finalFilter, ...permissionOr }
    } else final = finalFilter

    return { filter: final, perms: { canRead, canPick, canShip, isSuper, me } }
}
