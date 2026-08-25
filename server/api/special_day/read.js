const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_DAYS_AHEAD = 60

function formatDate(d) {
    return d.toISOString().split('T')[0]
}

export default async function read(payload, { DL }) {
    const today = new Date()
    const end = new Date()
    end.setDate(end.getDate() + DEFAULT_DAYS_AHEAD)

    const fromDate = payload.fromDate && DATE_RE.test(payload.fromDate)
        ? payload.fromDate
        : formatDate(today)
    const toDate = payload.toDate && DATE_RE.test(payload.toDate)
        ? payload.toDate
        : formatDate(end)

    return DL.SpecialDay.Model.find({
        active: true,
        date: { $gte: fromDate, $lte: toDate }
    })
        .select({ _id: 0, id: 1, name: 1, date: 1, storeId: 1, start: 1, end: 1, source: 1, createdBy: 1 })
        .sort({ date: 1, start: 1 })
        .lean()
}

read.config = {
    permissions: ['order_window_template:read']
}
