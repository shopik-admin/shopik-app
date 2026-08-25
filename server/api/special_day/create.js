import { validateSpecialDayShape, assertNoConflicts } from '#server/utils/data/specialDayGuard.js'

export default async function create(payload, { DL, _admin }) {
    const candidate = {
        name: payload.name,
        date: payload.date,
        storeId: payload.storeId || undefined,
        start: payload.start ?? null,
        end: payload.end ?? null
    }

    validateSpecialDayShape(candidate)

    if (candidate.storeId) {
        const store = await DL.Store.Model.findOne({ id: candidate.storeId }, { _id: 0, id: 1 }).lean()
        if (!store) throw { status: 400, message: 'store not found' }
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
