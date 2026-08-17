import getWindowTS from '#common/functions/getWindowTS.js'
const GET_DAYS_AHEAD = 10

export default async function options(payload, { DL, _user, utils }) {
    const cartOrder = await utils.data.getUserOrder({ DL, _user })

    if (!cartOrder?.storeId) return []

    const { storeId, window } = cartOrder
    const timezone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    const today = getWindowTS({ date: formatDate(new Date()), hour: 12, timezone })
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + GET_DAYS_AHEAD)

    const dateFrom = formatDate(today)
    const dateTo = formatDate(endDate)

    const windows = await DL.OrderWindow.Model.find({
        storeId,
        date: { $gte: dateFrom, $lte: dateTo },
        active: true
    })
        .select({
            _id: 0,
            date: 1,
            dayOfWeek: 1,
            start: 1,
            end: 1,
            leadTimestamp: 1,
            totalOrders: 1,
            maxCapacity: 1,
            id: 1
        })
        .sort({ date: 1, start: 1 })
        .lean()

    if (!windows?.length) return windows

    const now = Date.now()
    const grouped = {}

    for (const w of windows) {
        const isPast = w.leadTimestamp < now
        const isFull = w.totalOrders >= w.maxCapacity
        const isAlmostFull = w.totalOrders >= (w.maxCapacity - 2)
        delete w.leadTimestamp
        delete w.totalOrders
        delete w.maxCapacity
        w.chosen = window?.id === w.id
        w.disabled = isPast || isFull
        w.note = isPast ? 'past' : isFull ? 'full' : isAlmostFull ? 'almost full' : ''

        if (!grouped[w.date]) grouped[w.date] = {
            day: w.dayOfWeek,
            windows: []
        }
        grouped[w.date].windows.push(w)
    }

    return grouped
}

function formatDate(date) {
    return date.toISOString().split('T')[0]
}

options.config = { auth: 'required' }
