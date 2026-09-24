import { useNavigate } from 'react-router'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import styles from './checkoutSuccess.module.css'
import render from '#common/functions/render.js'
import { useText } from 'common/texts/TextProvider'

export default function CheckoutSuccess({ order = {} }) {
    const navigate = useNavigate()
    const { TR } = useText?.() || {}

    const number = order?.number || order?.orderNumber || '12345678'
    const address = order?.address
    const addressText = address
        ? `${address.street || ''} ${address.building || ''}${address.apartment ? ` ${TR?.('apartment')} ${address.apartment}` : ''}${address.city ? `, ${address.city}` : ''}`.trim()
        : order?.storeName ? `${TR?.('pickup_from')}${order.storeName}` : '—'

    const win = order?.window
    const windowText = (() => {
        if (!win?.id) return '—'
        const day = win.dayName || win.date || ''
        const time = `${String(win.start ?? '').padStart(2, '0')}:00-${String(win.end ?? '').padStart(2, '0')}:00`
        return win.dayName ? `${day}, ${time}` : time
    })()

    const cart = order?.cart || []
    const itemsCount = cart.reduce((acc, item) => acc + (item.amount || item.units || 1), 0)
    const total = order?.finalSumWithShipping ?? order?.sumWithShipping ?? order?.finalSum ?? order?.sum ?? 0

    return (
        <div className={styles.successPage}>
            <Flex col gap={12} alignItems="center">
                <div className={styles.iconWrap}>
                    <Icon name="check" className={styles.icon} />
                </div>
                <Flex col gap={4} alignItems="center">
                    <Text size="xl" bold className={styles.title}>checkout_success_title</Text>
                    <Text size="s" mode="sub" className={styles.orderNumber}>{`${TR?.('numberString')} #${number}`}</Text>
                </Flex>
            </Flex>

            <div className={styles.card}>
                <Text size="m" bold className={styles.cardTitle}>checkout_success_details</Text>

                <div className={styles.row}>
                    <Text className={styles.value}>{addressText}</Text>
                    <Text className={styles.label}>shipping_address</Text>
                </div>
                <div className={styles.row}>
                    <Text className={styles.value}>{windowText}</Text>
                    <Text className={styles.label}>delivery_time</Text>
                </div>
                <div className={styles.row}>
                    <Text className={styles.value}>{`${itemsCount} ${TR?.('items_suffix')}`}</Text>
                    <Text className={styles.label}>items_count_label</Text>
                </div>
                <div className={`${styles.row} ${styles.totalRow}`}>
                    <Text className={styles.totalValue}>{render({ type: 'coin', value: total })}</Text>
                    <Text className={styles.label}>total_inc_vat</Text>
                </div>
            </div>

            <button type="button" className={styles.homeBtn} onClick={() => navigate('/', { replace: true })}>
                <Text>back_to_home</Text>
            </button>
        </div>
    )
}
