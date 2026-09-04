import { useNavigate } from 'react-router'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import styles from './checkoutSuccess.module.css'
import render from '#common/functions/render.js'

export default function CheckoutSuccess({ order = {} }) {
    const navigate = useNavigate()

    const number = order?.number || order?.orderNumber || '12345678'
    const address = order?.address
    const addressText = address
        ? `${address.street || ''} ${address.building || ''}${address.apartment ? ` דירה ${address.apartment}` : ''}${address.city ? `, ${address.city}` : ''}`.trim()
        : order?.storeName ? `איסוף מ${order.storeName}` : '—'

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
                    <Text size="xl" bold className={styles.title}>ההזמנה שלך אושרה!</Text>
                    <Text size="s" mode="sub" className={styles.orderNumber}>מספר הזמנה #{number}</Text>
                </Flex>
            </Flex>

            <div className={styles.card}>
                <Text size="m" bold className={styles.cardTitle}>פרטי המשלוח וההזמנה</Text>

                <div className={styles.row}>
                    <Text className={styles.value}>{addressText}</Text>
                    <Text className={styles.label}>כתובת למשלוח</Text>
                </div>
                <div className={styles.row}>
                    <Text className={styles.value}>{windowText}</Text>
                    <Text className={styles.label}>זמן אספקה</Text>
                </div>
                <div className={styles.row}>
                    <Text className={styles.value}>{itemsCount} פריטים</Text>
                    <Text className={styles.label}>כמות פריטים</Text>
                </div>
                <div className={`${styles.row} ${styles.totalRow}`}>
                    <Text className={styles.totalValue}>{render({ type: 'coin', value: total })}</Text>
                    <Text className={styles.label}>סה״כ לתשלום (כולל מע״מ)</Text>
                </div>
            </div>

            <button type="button" className={styles.homeBtn} onClick={() => navigate('/', { replace: true })}>
                חזרה לדף הבית
            </button>
        </div>
    )
}
