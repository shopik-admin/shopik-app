import useApi from 'common/functions/useApi'
import render from 'common/functions/render'
import { useText } from 'common/texts/TextProvider'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Flex from 'common/components/Flex'
import Loader from 'common/components/Loader'
import styles from './order.module.css'

const EVENT_ICONS = {
    order_created: 'orders',
    order_status: 'statusChange',
    order_window: 'payRepeat',
    order_coupon: 'coupon',
    order_details: 'edit',
    order_delivery: 'truck',
    order_product: 'box',
    refund: 'refund',
    change: 'replace',
    payment: 'card',
    restore: 'restore',
    invoice_open: 'receipt',
    invoice_close: 'receipt',
    invoice_send: 'receipt',
    cash_register: 'calculator',
    order_notify: 'notifications',
    order_address: 'location',
    external_coupon: 'coupon',
    sms_message: 'message'
}

function EntryDetail({ entry }) {
    const { TR } = useText()
    // destructuring defaults don't apply to null, and these can be null in the DB
    const event = entry.event || {}
    const changes = entry.changes || {}
    const context = entry.context || {}

    if (event?.type === 'order_status' && (changes.oldData?.status || changes.newData?.status))
        return <Flex gap={6} alignItems='center'>
            {changes.oldData?.status && <Text size='s' mode='sub' lineThrough>{TR(changes.oldData.status)}</Text>}
            <Icon name='left' size={12} />
            <Text size='s' bold>{TR(changes.newData?.status || '')}</Text>
        </Flex>

    if (context.amount != null)
        return <Text size='s' mode='sub'>
            {render({ type: 'coin', value: context.amount })}{context.last4digits ? ` • ****${context.last4digits}` : ''}
        </Text>

    if (event?.type === 'order_coupon' && (context.code || changes.newData?.code))
        return <Text size='s' mode='sub'>{context.code || changes.newData.code}</Text>

    if (context.step)
        return <Text size='s' mode='sub'>{context.step}</Text>

    return null
}

function TimelineEntry({ entry, isLast }) {
    const { TR } = useText()
    const failed = entry.outcome?.success === false

    return <Flex gap={10} className={styles.timelineRow}>
        <Flex col alignItems='center' className={styles.timelineMarker}>
            <div className={styles.timelineDot}>
                <Icon name={EVENT_ICONS[entry.event?.type] || 'history'} size={13} />
            </div>
            {!isLast && <div className={styles.timelineLine} />}
        </Flex>
        <Flex col gap={3} className={styles.timelineBody}>
            <Flex gap={8} alignItems='center' wrap>
                <Text size='s' bold>{`timeline_${entry.event?.type || 'change'}`}</Text>
                <Text size='xs' mode='sub'>{entry.actor?.name || TR(entry.actor?.role === 'user' ? 'actor_user' : 'actor_system')}</Text>
                <Text size='xs' mode='sub'>{render({ type: 'datetime', value: entry.createdAt })}</Text>
            </Flex>
            <EntryDetail entry={entry} />
            {failed && entry.outcome?.errorMessage && <Text size='s' mode='error'>{entry.outcome.errorMessage}</Text>}
        </Flex>
    </Flex>
}

export default function OrderTimeline({ orderId }) {
    const { data, loading, error } = useApi('order/timeline', { orderId })

    if (loading) return <Loader />
    if (error) return <Text size='s' mode='error'>{error.message}</Text>

    const entries = data || []

    return <Flex col className={styles.timeline}>
        {entries.map((entry, i) => <TimelineEntry key={i} entry={entry} isLast={i === entries.length - 1} />)}
    </Flex>
}
