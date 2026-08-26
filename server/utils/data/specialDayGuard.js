import { overlapsWindow, overlapsSpecialDay, sameScope } from '#common/functions/specialDay.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const pad = h => String(h).padStart(2, '0')

export function validateSpecialDayShape(sd) {
    if (!sd.name?.trim()) throw { status: 400, message: 'name is required' }
    if (!DATE_RE.test(sd.date || '')) throw { status: 400, message: 'date must be YYYY-MM-DD' }

    if (sd.storeIds != null) {
        if (!Array.isArray(sd.storeIds)) throw { status: 400, message: 'storeIds must be an array' }
        for (const id of sd.storeIds) {
            if (typeof id !== 'string' || !id.trim()) throw { status: 400, message: 'storeIds must be string ids' }
        }
    }

    if (sd.start != null || sd.end != null) {
        if (!Number.isInteger(sd.start) || !Number.isInteger(sd.end))
            throw { status: 400, message: 'start and end must be whole hours' }
        if (sd.start < 0 || sd.start > 23 || sd.end < 1 || sd.end > 23)
            throw { status: 400, message: 'hours must be within 0-23' }
        if (sd.end <= sd.start)
            throw { status: 400, message: 'end must be greater than start' }
    }
}

/**
 * Conflicts for a candidate special day shape:
 * 1. another active special day covering the same scope + hours
 * 2. generated windows that already carry orders inside the closure (409)
 */
export async function assertNoConflicts(DL, candidate, existingId) {
    const sameDate = await DL.SpecialDay.Model.find({
        active: true,
        date: candidate.date,
        ...(existingId ? { id: { $ne: existingId } } : {})
    })
        .select({ _id: 0, id: 1, name: 1, storeIds: 1, start: 1, end: 1 })
        .lean()

    const conflict = sameDate.find(other =>
        sameScope(candidate, other) && overlapsSpecialDay(candidate, other)
    )
    if (conflict)
        throw {
            status: 409,
            message: `an active special day already covers this scope (${conflict.name})`
        }

    const storeIds = candidate.storeIds?.length
        ? candidate.storeIds
        : await DL.Store.Model.distinct('id', { active: true })

    const busyWindows = (await DL.OrderWindow.Model.find({
        storeId: { $in: Array.isArray(storeIds) ? storeIds : [storeIds] },
        date: candidate.date,
        totalOrders: { $gt: 0 },
        active: true
    })
        .select({ _id: 0, storeId: 1, start: 1, end: 1 })
        .lean())
        .filter(w => overlapsWindow(candidate, w))

    if (busyWindows.length) {
        const stores = await DL.Store.Model.find(
            { id: { $in: [...new Set(busyWindows.map(w => w.storeId))] } },
            { _id: 0, id: 1, name: 1 }
        ).lean()
        const nameById = new Map(stores.map(s => [s.id, s.name]))
        const listing = busyWindows
            .sort((a, b) => a.storeId.localeCompare(b.storeId) || a.start - b.start)
            .map(w => `${nameById.get(w.storeId) || w.storeId} ${pad(w.start)}:00-${pad(w.end)}:00`)
            .join(', ')

        throw { status: 409, message: `cannot close — orders exist in: ${listing}` }
    }
}
