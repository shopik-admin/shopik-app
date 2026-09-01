import diff from '#common/functions/diff.js'
import { validateSpecialDayShape, assertNoConflicts } from '#server/utils/data/specialDayGuard.js'

export default async function update(payload, { DL }) {
    const { id } = payload

    const existing = await DL.SpecialDay.readById(id)
    if (!existing) throw { status: 404, message: 'special day not found' }

    const candidate = {
        name: payload.name !== undefined ? payload.name : existing.name,
        date: payload.date !== undefined ? payload.date : existing.date,
        storeIds: payload.storeIds !== undefined
            ? (Array.isArray(payload.storeIds) && payload.storeIds.length ? payload.storeIds.filter(Boolean) : undefined)
            : existing.storeIds,
        start: payload.start !== undefined ? (payload.start ?? null) : (existing.start ?? null),
        end: payload.end !== undefined ? (payload.end ?? null) : (existing.end ?? null)
    }

    validateSpecialDayShape(candidate)

    if (candidate.storeIds?.length) {
        const found = await DL.Store.Model.distinct('id', { id: { $in: candidate.storeIds } })
        if (found.length !== candidate.storeIds.length) throw { status: 400, message: 'store not found' }
    }

    await assertNoConflicts(DL, candidate, id)

    const updateData = diff(existing, candidate)
    if (!Object.keys(updateData).length) return existing

    return DL.SpecialDay.updateOne({ id }, updateData)
}

update.config = {
    required: ['id'],
    permissions: ['order_window_template:update']
}
