export function todayStr() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date())
}

export function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    date.setDate(date.getDate() + days)
    return toDateStr(date)
}

export function toDateStr(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export function parseDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d)
}

export function getDayOfWeek(dateStr) {
    return parseDate(dateStr).getDay()
}

// 'YYYY-MM' helpers for the monthly calendar
export function currentMonth() {
    return todayStr().slice(0, 7)
}

export function addMonths(month, delta) {
    const [y, m] = month.split('-').map(Number)
    const date = new Date(y, m - 1 + delta, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthGridDays(month) {
    // Returns 42 cells (6 weeks) of {date|null} starting Sunday
    const [y, m] = month.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const startOffset = first.getDay()
    const cells = []
    for (let i = 0; i < 42; i++) {
        const date = new Date(y, m - 1, 1 - startOffset + i)
        cells.push({
            date: toDateStr(date),
            inMonth: date.getMonth() === m - 1,
            dayOfWeek: date.getDay()
        })
    }
    return cells
}

export function formatHour(h) {
    return `${String(h).padStart(2, '0')}:00`
}

export function formatHourRange(start, end) {
    return `${formatHour(start)}–${end >= 24 ? '23:59' : formatHour(end)}`
}
