import { useEffect, useRef, useState } from 'react'
import classNames from 'common/functions/classNames'
import useApi from 'common/functions/useApi'
import { useText } from 'common/texts/TextProvider'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import StatusProgress from './StatusProgress'
import OrderTimeline from './OrderTimeline'
import styles from './order.module.css'

const FAILED_STATUSES = ['canceled', 'failed']

export default function OrderStatusSection({ order }) {
    const [expanded, setExpanded] = useState(false)
    const fetchOnExpand = useRef(false)
    const { TR } = useText()
    const isFailed = FAILED_STATUSES.includes(order.status)

    // canceled/failed orders need the timeline even collapsed, so the stepper
    // can show the statuses the order went through before failing
    const timelineApi = useApi('order/timeline', { orderId: order.id }, { hold: true })
    useEffect(() => {
        if (expanded || (isFailed && !fetchOnExpand.current)) {
            fetchOnExpand.current = true
            timelineApi.callReq()
        }
    }, [expanded, isFailed])

    return <Card className={styles.statusSection}>
        <div className={classNames(styles.statusInner, expanded && styles.statusExpanded)}>
            <div className={styles.stickyBar}>
                <Flex alignItems='center' gap={10}>
                    <Flex grow>
                        <StatusProgress status={order.status} timeline={timelineApi.data} />
                    </Flex>
                    <Button
                        icon='history'
                        mode='text'
                        onClick={() => setExpanded(e => !e)}
                        className={classNames(styles.timelineToggle, expanded && styles.timelineToggleActive)}
                    />
                </Flex>
            </div>
            {expanded && <div className={styles.timelineScrollArea}>
                <OrderTimeline orderId={order.id} />
            </div>}
        </div>
    </Card>
}
