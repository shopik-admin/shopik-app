import classNames from 'common/functions/classNames'
import { useLists } from 'common/features/Lists'
import { useNavigate } from 'react-router'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import styles from './ops.module.css'
import { DeliveryMethodTag, formatWindow } from './orderUtils'

export default function OrderCard({ order = {} }) {
    const
        { deliveryMethod, status, storeId } = order,
        windowTime = formatWindow(order.window),
        done = status == 'done',
        { stores } = useLists(),
        store = stores.find(s => s.value == storeId),
        address = deliveryMethod == 'pickup' ? store?.address : order.address,
        navigate = useNavigate()

    function onOrderCardClick() {
        navigate(`/ops-order/${order.id}`)
    }

    return <Flex col onClick={onOrderCardClick} className={classNames(
        styles.orderCard,
        [styles.danger, windowTime.minutes <= 10],
        [styles.warning, windowTime.minutes > 10 && windowTime.minutes < 60],
        [styles.success, done]
    )}>
        <Flex className={styles.row} alignItems='center' justifyContent='space-between'>
            <Flex gap={5} alignItems='center' >
                <DeliveryMethodTag deliveryMethod={order.deliveryMethod} />
                <Text bold>|</Text>
                <Text bold>{order.number}</Text>
            </Flex>
            <Text size='s'>שם הלקוח</Text>
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
            {order.picker?.name && <Text size='s'>{order.picker.name}</Text>}
        </Flex>
    </Flex>
}
