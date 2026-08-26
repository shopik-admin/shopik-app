import { validateSpecialDayShape, assertNoConflicts } from '#server/utils/data/specialDayGuard.js'

export default async function create(payload, { DL, _admin }) {
    const rawIds = payload.storeIds
    const storeIds = Array.isArray(rawIds) ? rawIds.filter(Boolean) : undefined
    const candidate = {
        name: payload.name,
        date: payload.date,
        storeIds: storeIds?.length ? storeIds : undefined,
        start: payload.start ?? null,
        end: payload.end ?? null
    }

    validateSpecialDayShape(candidate)

    if (candidate.storeIds?.length) {
        const found = await DL.Store.Model.distinct('id', { id: { $in: candidate.storeIds } })
        if (found.length !== candidate.storeIds.length) throw { status: 400, message: 'store not found' }
    }

    // Order-protection + same-scope overlap guard
    await assertNoConflicts(DL, candidate)

    return DL.SpecialDay.create({
        ...candidate,
        source: DL.SpecialDay.constants.SOURCE.MANUAL,
        createdBy: _admin.id
    })
}

create.config = {
    required: ['name', 'date'],
    permissions: ['order_window_template:update']
}
