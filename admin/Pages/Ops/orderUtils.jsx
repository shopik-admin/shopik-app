import Flex from "#common/components/Flex/index.jsx"
import Icon from "#common/components/Icon/index.jsx"
import Text from "#common/components/Text/index.jsx"
import { formatHourRange } from '../Windows/dates.js'
import { useState, useEffect } from 'react'

export function formatWindow(w) {
    if (!w) return { text: '', dayText: '', textLong: '', minutes: 0 }

    const range = w.start != null && w.end != null ? formatHourRange(w.start, w.end) : '' // 10:00–12:00
    const withTime = (day) => range ? `${day}, ${range}` : day

    let dayText = '', textLong = ''
    if (w.date) {
        const d = new Date(w.date), today = new Date()
        today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0)
        const diff = Math.round((d - today) / 86400000)
        if (diff === 0 || diff === 1) {
            const day = diff === 0 ? 'היום' : 'מחר'
            dayText = withTime(day)
            textLong = withTime(day)
        } else {
            dayText = withTime(d.toLocaleDateString('he-IL', { weekday: 'short' }))
            textLong = withTime(d.toLocaleDateString('he-IL', { weekday: 'long' })) // יום חמישי, 10:00–12:00
        }
    } else {
        dayText = range
        textLong = range
    }

    if (!w.endTimestamp) return { text: '--:--', dayText, textLong, minutes: 0 }

    const diffMs = new Date(w.endTimestamp).getTime() - Date.now()
    if (diffMs < 0) return { text: '00:00', dayText, textLong, minutes: 0, isLate: true }

    const totalMinutes = Math.floor(diffMs / (1000 * 60))
    const totalHours = Math.floor(totalMinutes / 60)
    const days = Math.floor(totalHours / 24)

    const hours = totalHours % 24
    const minutes = totalMinutes % 60

    const text = days > 0
        ? `${days} ימים ${String(hours).padStart(2, '0')} שעות`
        : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

    return {
        text,
        dayText,
        textLong,
        minutes: totalMinutes,
        isLate: totalMinutes <= 0,
        isAlmostLate: totalMinutes <= 15
    }
}

// Live countdown of the time remaining in the window.
// Re-renders every minute so `formatWindow(...).text` never goes stale.
export function RemainingTime({ window: w, ...textProps }) {
    const [, setTick] = useState(0)

    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 60 * 1000)
        return () => clearInterval(id)
    }, [])

    return <Text {...textProps}>{formatWindow(w).text}</Text>
}


export function DeliveryMethodTag({ deliveryMethod }) {
    return <Flex gap={5} alignItems='center' >
        <Icon name={deliveryMethod == 'pickup' ? 'bag' : 'truck'} />
        <Text bold>{deliveryMethod}</Text>
    </Flex>
}