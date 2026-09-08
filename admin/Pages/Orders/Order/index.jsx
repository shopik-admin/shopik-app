import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import useApi from 'common/functions/useApi'
import { useText } from 'common/texts/TextProvider'
import Button from 'common/components/Button'
import Loader from 'common/components/Loader'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Flex from 'common/components/Flex'
import OrderStatusSection from './OrderStatusSection'
import OrderActions from './OrderActions'
import RefundSection from './RefundSection'
import RefundsSection from './RefundsSection'
import ProductsSection from './ProductsSection'
import OrderDetailsCard from './OrderDetailsCard'
import PaymentDetailsCard from './PaymentDetailsCard'
import styles from './order.module.css'

const dateFormatter = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('he', { hour: '2-digit', minute: '2-digit', hour12: false })

const formatPaidAt = value => {
    const date = new Date(value)
    return `${dateFormatter.format(date)} | ${timeFormatter.format(date)}`
}

function LabelChip({ label }) {
    const style = label.style || {}
    return <Flex gap={4} alignItems='center' className={styles.labelChip} style={{ backgroundColor: style.backgroundColor, color: style.color }}>
        {style.iconName && <Icon name={style.iconName} size={12} />}
        <Text size='s' bold style={{ color: style.color }}>{label.label || label.name}</Text>
    </Flex>
}

export default function Order() {
    const { orderId } = useParams()
    const navigate = useNavigate()
    const { TR } = useText()
    const [refundMode, setRefundMode] = useState(false)
    const detailsApi = useApi('order/details', { id: orderId })
    const { data: order, loading, error } = detailsApi

    if (loading) return <Loader />
    if (error) return <Text center mode='error'>{error.message}</Text>
    if (!order) return <Text center mode='error'>{'order_not_found'}</Text>

    const refresh = async () => { await detailsApi.callReq() }

    return <Flex col gap={15} className={styles.page}>
        <Flex gap={10} alignItems='flex-start'>
            <Button icon='back' mode='text' onClick={() => navigate('/orders')} className={styles.backButton} />
            <Flex gap={4} justifyContent='space-between' grow>
                <Flex col gap={4} className={styles.orderHeader}>
                    <Flex gap={10} alignItems='center' wrap>
                        <Text size='h2' bold>#{order.number}</Text>
                        {(order.labels || []).map((label, i) => <LabelChip key={i} label={label} />)}
                    </Flex>
                    {order.paidAt && <Flex gap={6} alignItems='center' className={styles.payDate}>
                        <Text size='m'>{`${formatPaidAt(order.paidAt)}`}</Text>
                    </Flex>}
                </Flex>
                <OrderActions
                    order={order}
                    refundMode={refundMode}
                    onToggleRefund={() => setRefundMode(m => !m)}
                    onChanged={refresh}
                />
            </Flex>
        </Flex>
        <Flex gap={15} alignItems='flex-start' className={styles.content}>
            <Flex col gap={15} grow className={styles.mainColumn}>
                <OrderStatusSection order={order} />
                {refundMode
                    ? <RefundSection order={order} onDone={async () => { await refresh(); setRefundMode(false) }} onExit={() => setRefundMode(false)} />
                    : <ProductsSection order={order} />}
                {Number(order.refundedTotal || 0) > 0 && <RefundsSection order={order} />}
            </Flex>
            <Flex col gap={15} className={styles.sidebar}>
                <OrderDetailsCard order={order} />
                <PaymentDetailsCard order={order} onChanged={refresh} />
            </Flex>
        </Flex>
    </Flex>
}
