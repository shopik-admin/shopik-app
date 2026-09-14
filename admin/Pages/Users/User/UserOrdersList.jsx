import classNames from 'common/functions/classNames'
import { useLists } from 'common/features/Lists'
import { useNavigate } from 'react-router'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import ProgressGauge from 'common/components/ProgressGauge'
import { DeliveryMethodTag, formatWindow, orderCardTone, RemainingTime } from 'Pages/Ops/orderUtils'
import styles from './user.module.css'

function OrderCard({ order = {} }) {
    const
        { deliveryMethod, status, storeId } = order,
        { handled = 0, total = 0 } = order.pickProgress || {},
        windowTime = formatWindow(order.window),
        tone = orderCardTone(order),
        { stores } = useLists(),
        { TR } = useText(),
        store = stores.find(s => s.value == storeId),
        address = deliveryMethod == 'pickup' ? store?.address : order.address,
        navigate = useNavigate()

    function onOrderCardClick() {
        navigate(`/orders/${order.id}`)
    }

    return <Flex col onClick={onOrderCardClick} className={classNames(
        styles.orderCard,
        [styles.danger, tone == 'danger'],
        [styles.warning, tone == 'warning'],
        [styles.success, tone == 'success']
    )}>
        <Flex className={styles.row} alignItems='center' justifyContent='space-between'>
            <Flex gap={5} alignItems='center' >
                <DeliveryMethodTag deliveryMethod={order.deliveryMethod} />
                <Text bold>|</Text>
                <Text bold>{order.number}</Text>
            </Flex>
            <Text size='s'>{store?.text}</Text>
        </Flex>
        <Flex className={styles.row} alignItems='center' justifyContent='space-between' >
            <Flex gap={5} alignItems='center' >
                <Icon name='stores' />
                <Text size='s'>{store?.text}</Text>
            </Flex>
            <Flex gap={5} alignItems='center' >
                <Icon name='location' />
                <Text size='s'>{address?.street} {address?.building}, {address?.city}</Text>
            </Flex>
            <Flex gap={5} alignItems='center' >
                <Icon name='time' />
                <Text size='s'>{windowTime.dayText}</Text>
            </Flex>
        </Flex>
        <Flex className={styles.row} justifyContent='space-between'>
            <Flex gap={20} center>
                <ProgressGauge value={total ? (handled / total) * 100 : 0} />
                <Flex col gap={5}>
                    <Text bold size='xl'>{handled}/{total}</Text>
                    <Text size='s' mode='sub'>מוצרים שטופלו</Text>
                </Flex>
            </Flex>
            {status != 'done' && <Flex col gap={5} center>
                <RemainingTime bold size='xl' window={order.window} />
                <Text size='s' mode='sub'>לסיום ליקוט</Text>
            </Flex>}
        </Flex>
        <Flex className={styles.row} alignItems='center' justifyContent='space-between'>
            <Flex gap={5} alignItems='center' >
                <Icon name='checkEmpty' />
                <Text bold>{TR(status)}</Text>
            </Flex>
        </Flex>
    </Flex>
}

export default function UserOrdersList({ orders = [] }) {
    return <Card className={styles.ordersCard}>
        <Flex gap={8} alignItems='center' className={styles.ordersCardHeader}>
            <Text size='h3' bold className={styles.ordersCardTitle}>{'user_orders_title'}</Text>
            <Text size='s' bold className={styles.countPill}>{orders.length}</Text>
        </Flex>
        <Flex col gap={12}>
            {orders.map(order => <OrderCard key={order.id || order.number} order={order} />)}
        </Flex>
    </Card>
}
