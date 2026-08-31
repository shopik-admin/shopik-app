import classNames from 'common/functions/classNames'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import styles from './ops.module.css'

export default function OrderCard({ order = {} }) {
    const
        { deliveryMethod, status } = order,
        windowTime = formatTimeHM(order.window),
        done = status == 'done'

    return <Flex col className={classNames(
        styles.orderCard,
        [styles.danger, windowTime.minutes <= 10],
        [styles.warning, windowTime.minutes > 10 && windowTime.minutes < 60],
        [styles.success, done]
    )}>
        <Flex className={styles.row} alignItems='center' justifyContent='space-between'>
            <Flex gap={5} alignItems='center' >
                <Icon name={deliveryMethod == 'pickup' ? 'bag' : 'truck'} />
                <Text bold>{deliveryMethod}</Text>
                <Text bold>|</Text>
                <Text bold>{order.number}</Text>
            </Flex>
            <Text size='s'>שם הלקוח</Text>
        </Flex>
        <Flex className={styles.row} alignItems='center' justifyContent='space-between' >
            <Flex gap={5} alignItems='center' >
                <Icon name='stores' />
                <Text size='s'>store name</Text>
            </Flex>
            <Flex gap={5} alignItems='center' >
                <Icon name='location' />
                <Text size='s'>store location</Text>
            </Flex>
            <Flex gap={5} alignItems='center' >
                <Icon name='time' />
                <Text size='s'>{formatDayWindow(order.window)}</Text>
            </Flex>
        </Flex>
        <Flex className={styles.row} justifyContent='space-around'>
            <Flex col gap={5}>
                <Text bold size='xl'>8/20</Text>
                <Text size='s' mode='sub'>מוצרים שטופלו</Text>
            </Flex>
            <Flex col gap={5} center>
                <Text bold size='xl'>{windowTime.text}</Text>
                <Text size='s' mode='sub'>לסיום ליקוט</Text>
            </Flex>
        </Flex>
        <Flex className={styles.row} alignItems='center' justifyContent='space-between'>
            <Flex gap={5} alignItems='center' >
                <Icon name='checkEmpty' />
                <Text bold>{status}</Text>
            </Flex>
            <Text size='s'>שם המלקט</Text>
        </Flex>
    </Flex>
}

function formatDayWindow(w) {
    if (!w) return ''
    if (w.date && w.start != null && w.end != null) {
        const d = new Date(w.date)
        const day = d.toLocaleDateString('he-IL', { weekday: 'short' })
        return `${day} ${w.start}-${w.end}`
    }
    if (w.start != null && w.end != null) return `${w.start}-${w.end}`
    if (w.date) return w.date
    return ''
}

function formatTimeHM(w) {
    if (!w?.endTimestamp) return { text: '--:--', minutes: 0 }

    const diffMs = Date.now() - new Date(w.endTimestamp).getTime()
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