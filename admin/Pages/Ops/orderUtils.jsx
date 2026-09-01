import Flex from "#common/components/Flex/index.jsx"
import Icon from "#common/components/Icon/index.jsx"
import Text from "#common/components/Text/index.jsx"

export function formatDayWindow(w) {
    if (!w) return ''
    const time = w.start != null && w.end != null ? ` ${w.start}-${w.end}` : ''

    if (w.date) {
        const d = new Date(w.date), today = new Date()
        today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0)
        const diff = Math.round((d - today) / 86400000)
        const day = diff === 0 ? 'היום' : diff === 1 ? 'מחר' : d.toLocaleDateString('he-IL', { weekday: 'short' })
        return day + time
    }
    return w.start != null && w.end != null ? `${w.start}-${w.end}` : ''
}

export function formatTimeHM(w) {
    if (!w?.endTimestamp) return { text: '--:--', minutes: 0 }

    const diffMs = new Date(w.endTimestamp).getTime() - Date.now()
    if (diffMs < 0) return { text: '00:00', minutes: 0 } // Handle future dates if necessary

    const totalMinutes = Math.floor(diffMs / (1000 * 60))
    const totalHours = Math.floor(totalMinutes / 60)
    const days = Math.floor(totalHours / 24)

    const hours = totalHours % 24
    const minutes = totalMinutes % 60

    let text = ''

    if (days > 0) {
        text = `${days}d ${String(hours).padStart(2, '0')}h`
    } else {
        text = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }

    return { text, minutes: totalMinutes }
}


export function DeliveryMethodTag({ deliveryMethod }) {
    return <Flex gap={5} alignItems='center' >
        <Icon name={deliveryMethod == 'pickup' ? 'bag' : 'truck'} />
        <Text bold>{deliveryMethod}</Text>
    </Flex>
}