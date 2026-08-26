import { sanitizeGroupCapacities, mergeGroupCounts } from '#server/utils/data/windowGroups.js'

export default async function update_window(payload, { DL }) {
    const { id, maxCapacity, disabled, areaGroups } = payload

    const windowDoc = await DL.OrderWindow.readById(id)
    if (!windowDoc) throw { status: 400, message: 'window not found' }

    const update = {}

    if (maxCapacity !== undefined) {
        if (!Number.isInteger(maxCapacity) || maxCapacity < 1 || maxCapacity > 100)
            throw { status: 400, message: 'maxCapacity must be an integer between 1 and 100' }
        const overflowing = (windowDoc.areaGroups || []).some(g => g?.capacity > maxCapacity)
        if (overflowing)
            throw { status: 400, message: 'reduce area-group capacities before lowering maxCapacity' }
        update.maxCapacity = maxCapacity
        update.manualCapacity = true
    }

    if (areaGroups !== undefined) {
        // Config-only payload: live counters are merged back server-side so a
        // stale client can never clobber reservations.
        const sanitized = sanitizeGroupCapacities(areaGroups, update.maxCapacity ?? windowDoc.maxCapacity)
        update.areaGroups = mergeGroupCounts(windowDoc.areaGroups, sanitized)
        update.manualCapacity = true
    }

    if (disabled !== undefined) {
        if (typeof disabled !== 'boolean')
            throw { status: 400, message: 'disabled must be a boolean' }
        update.disabled = disabled
    }

    if (!Object.keys(update).length)
        throw { status: 400, message: 'nothing to update' }

    const updated = await DL.OrderWindow.Model.findOneAndUpdate(
        { id },
        { $set: update },
        { returnDocument: 'after' }
    ).lean()

    return updated
}

update_window.config = {
    required: ['id'],
    permissions: 'order_window_template:update'
}
