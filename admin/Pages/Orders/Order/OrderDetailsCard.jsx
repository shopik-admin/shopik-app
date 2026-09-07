import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import render from 'common/functions/render'
import { DeliveryMethodTag, formatWindow } from 'Pages/Ops/orderUtils'
import styles from './order.module.css'

function InfoRow({ icon, label, children }) {
    return <Flex gap={12} alignItems='flex-start'>
        <Icon name={icon} size={22} className={styles.infoIcon} />
        <Flex col gap={4}>
            {label && <Text size='l' bold>{label}</Text>}
            {children}
        </Flex>
    </Flex>
}

export default function OrderDetailsCard({ order }) {
    const windowTime = formatWindow(order.window)
    const fullName = `${order.name?.first || ''} ${order.name?.last || ''}`.trim()

    return <Card className={styles.detailsCard}>
        <Text size='h3' bold className={styles.cardTitle}>{'order_details_title'}</Text>
        <Flex col gap={22}>
            {fullName && <InfoRow icon='person' label={fullName}>
                <Text size='m' mode='sub'>{order.phone}</Text>
                {order.secondPhone && <Text size='m' mode='sub'>{order.secondPhone}</Text>}
                {order.email && <Flex gap={5} alignItems='center'>
                    <Icon name='mail' size={14} />
                    <Text size='m' mode='sub'>{order.email}</Text>
                </Flex>}
            </InfoRow>}
            {order.address && <InfoRow icon='location' label='customer_address'>
                <Text size='m'>{render({ type: 'address', value: order.address })}</Text>
                {order.address.comment && <Text size='m' mode='sub'>{order.address.comment}</Text>}
            </InfoRow>}
            <InfoRow icon='time' label='order_window'>
                <Text size='m'>{windowTime.dayText}</Text>
                <DeliveryMethodTag deliveryMethod={order.deliveryMethod} />
            </InfoRow>
            {(order.replaceProducts || order.replaceProductsNoCall || order.leaveOrderAtDoor) && <InfoRow icon='replace' label='replace_and_missing'>
                {order.replaceProducts && <Text size='m'>{'replace_products'}</Text>}
                {order.replaceProductsNoCall && <Text size='m'>{'replace_no_call'}</Text>}
                {order.leaveOrderAtDoor && <Text size='m'>{'leave_at_door'}</Text>}
            </InfoRow>}
            {order.comment && <InfoRow icon='note' label='order_comment'>
                <Text size='m'>{order.comment}</Text>
            </InfoRow>}
            {order.picker?.name && <InfoRow icon='user' label='picked_by'>
                <Text size='m'>{order.picker.name}</Text>
            </InfoRow>}
            {order.pickFinalizer?.name && <InfoRow icon='check' label='packed_by'>
                <Text size='m'>{order.pickFinalizer.name}</Text>
            </InfoRow>}
            {order.shipper?.name && <InfoRow icon='truck' label='shipped_by'>
                <Text size='m'>{order.shipper.name}</Text>
            </InfoRow>}
            {order.cancelReason && <InfoRow icon='x' label='cancel_reason'>
                <Text size='m' mode='error'>{order.cancelReason}</Text>
            </InfoRow>}
        </Flex>
    </Card>
}
