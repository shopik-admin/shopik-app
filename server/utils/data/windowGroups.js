/**
 * Area-group capacity helpers for order windows.
 *
 * A window's `areaGroups` array carves a dedicated slice of its maxCapacity
 * per area group: [{ groupId, capacity, count? }] (count only on concrete
 * order_window docs). Users whose address area is not part of any configured
 * group cannot see or book the window at all.
 */

/**
 * Validates + normalizes an incoming areaGroups config.
 * Accepts [{ groupId, capacity }] entries; returns clean sorted entries,
 * or [] when empty/absent. Throws { status, message } on invalid input.
 */
export function sanitizeGroupCapacities(areaGroups, maxCapacity) {
    if (areaGroups == null) return []
    if (!Array.isArray(areaGroups))
        throw { status: 400, message: 'areaGroups must be an array' }

    const seen = new Set()
    const out = []
    for (const g of areaGroups) {
        if (!g || typeof g.groupId !== 'string' || !g.groupId.trim())
            throw { status: 400, message: 'areaGroups entry is missing groupId' }
        const groupId = g.groupId.trim()
        if (seen.has(groupId)) continue
        seen.add(groupId)

        const capacity = g.capacity
        if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100)
            throw { status: 400, message: 'group capacity must be an integer between 0 and 100' }
        if (maxCapacity != null && capacity > maxCapacity)
            throw { status: 400, message: 'group capacity cannot exceed the window maxCapacity' }

        out.push({ groupId, capacity })
    }
    return out.sort((a, b) => (a.groupId < b.groupId ? -1 : 1))
}

/**
 * Maps a validated config onto existing window areaGroups, preserving live
 * counters by groupId. Entries removed from the config are dropped.
 */
export function mergeGroupCounts(existingAreaGroups = [], sanitizedConfig = []) {
    return sanitizedConfig.map(({ groupId, capacity }) => ({
        groupId,
        capacity,
        count: existingAreaGroups.find(g => g?.groupId === groupId)?.count ?? 0
    }))
}

/**
 * Canonical signature used to detect whether group config actually changed.
 */
export function groupsSignature(areaGroups = []) {
    return (areaGroups || [])
        .map(g => `${g?.groupId}:${g?.capacity}`)
        .sort()
        .join(';')
}

/**
 * Ids of the active area groups of `storeId` that contain `areaId`.
 * Business rule: an area belongs to at most one group per store — if the
 * data ever violates that, all matches are returned and consumers pick
 * the first deterministically.
 */
export async function findUserGroupIds(DL, storeId, areaId) {
    if (!storeId || !areaId) return []
    const groups = await DL.AreaGroup.Model.find(
        { storeId, active: true, areaIds: areaId },
        { _id: 0, id: 1 }
    ).lean()
    return groups.map(g => g.id)
}

/**
 * Atomic guard ensuring the window has free global capacity AND the given
 * group bucket is not exhausted. Without groupId it reduces to the plain
 * totalOrders < maxCapacity check.
 */
export function reserveGuard(windowId, groupId) {
    const conditions = [{ $lt: ['$totalOrders', '$maxCapacity'] }]
    if (groupId) {
        conditions.push({
            $not: {
                $anyElementTrue: {
                    $map: {
                        input: '$areaGroups',
                        as: 'g',
                        in: {
                            $and: [
                                { $eq: ['$$g.groupId', groupId] },
                                { $gte: ['$$g.count', '$$g.capacity'] }
                            ]
                        }
                    }
                }
            }
        })
    }
    return { id: windowId, $expr: { $and: conditions } }
}

/**
 * Releases a reservation: decrements totalOrders (guarded > 0) and, when a
 * group counter was consumed, that counter too (best-effort so a missing or
 * already-zero entry can never block the global decrement).
 */
export async function releaseWindowReservation(DL, windowId, groupId) {
    if (!windowId) return
    await DL.OrderWindow.Model.updateOne(
        { id: windowId, totalOrders: { $gt: 0 } },
        { $inc: { totalOrders: -1 } }
    )
    if (!groupId) return
    await DL.OrderWindow.Model.updateOne(
        { id: windowId, areaGroups: { $elemMatch: { groupId, count: { $gt: 0 } } } },
        { $inc: { 'areaGroups.$[g].count': -1 } },
        { arrayFilters: [{ 'g.groupId': groupId }] }
    )
}
