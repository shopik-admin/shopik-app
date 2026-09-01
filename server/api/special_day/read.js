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

    return DL.SpecialDay.read(
        {
            active: true,
            date: { $gte: fromDate, $lte: toDate }
        },
        { _id: 0 },
        { sort: { date: 1, start: 1 } }
    )
}

read.config = {
    permissions: ['order_window_template:read']
}
