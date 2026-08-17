export default function getWindowTS(window) {
    const { date, hour, timezone } = window
    const [year, month, day] = date.split('-').map(Number)

    // Formatter configured to explicitly give us the timezone offset string (e.g. GMT+3, GMT-05:00)
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'shortOffset',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hourCycle: 'h23'
    })

    // 1. Initial guess in UTC
    const utcGuess = Date.UTC(year, month - 1, day, hour)

    // 2. Format the guess date in the target timezone
    const parts = formatter.formatToParts(new Date(utcGuess))
    const timeZonePart = parts.find(p => p.type === 'timeZoneName')?.value // e.g. "GMT+3" or "GMT-05:00"

    // 3. Extract offset minutes from the formatted timezone string
    const offsetMinutes = parseOffsetToMinutes(timeZonePart)

    // 4. Construct the target date adjusting for local offset
    // Target UTC = Local desired time - Offset
    const targetUTC = Date.UTC(year, month - 1, day, hour) - (offsetMinutes * 60 * 1000)

    return new Date(targetUTC)
}

function parseOffsetToMinutes(offsetStr) {
    if (!offsetStr || offsetStr === 'GMT' || offsetStr === 'UTC') return 0

    // Matches GMT+3, GMT-05:00, GMT+0230, etc.
    const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/)
    if (!match) return 0

    const [, sign, hours, minutes = '0'] = match
    const totalMinutes = parseInt(hours, 10) * 60 + parseInt(minutes, 10)
    return sign === '-' ? -totalMinutes : totalMinutes
}