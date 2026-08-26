import diff from '#common/functions/diff.js'
import { sanitizeGroupCapacities } from '#server/utils/data/windowGroups.js'

export default async function update(payload, { DL }) {
    const { id } = payload
    const template = await DL.OrderWindowTemplate.readById(id)
    if (!template) throw { status: 400, message: 'order window template does not exist' }

    const potentialUpdate = {
        windows: payload.windows,
        name: payload.name,
        leadHours: payload.leadHours,
        timezone: payload.timezone
    }

    const updateData = diff(template, potentialUpdate)
    const nothingToUpdate = Object.keys(updateData).length === 0
    if (nothingToUpdate) return template

    if (updateData.windows) {
        if (!updateData.windows?.length)
            throw { status: 400, message: 'at least one window is required' }
        const invaildWindows = updateData.windows.some(w => w.start >= w.end)
        if (invaildWindows) throw { status: 400, message: 'windows start must be less than end' }

        // diff returns the full replacement array; normalize group capacities
        // (stripped entirely for the store-agnostic master template).
        updateData.windows = updateData.windows.map(w => ({
            ...w,
            areaGroups: template.master ? [] : sanitizeGroupCapacities(w.areaGroups, w.maxCapacity)
        }))
    }

    const updated = await DL.OrderWindowTemplate.updateOne({ id }, updateData)
    return updated
}

update.config = {
    required: ['id'],
    permissions: 'order_window_template:update'
}
