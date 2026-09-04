import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Loader from 'common/components/Loader'
import Button from 'common/components/Button'
import ProductInline from 'common/components/ProductInline'
import apiReq from 'common/functions/apiReq'
import render from 'common/functions/render.js'
import styles from './Orders.module.css'

const statusClass = {
    paid: styles.statusPaid,
    picking: styles.statusPicking,
    picked: styles.statusPicked,
    packed: styles.statusPacked,
    shipped: styles.statusShipped,
    done: styles.statusDone,
    canceled: styles.statusCanceled,
    paid_edit: styles.statusPaid,
}

function formatDate(d) {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return String(d) }
}

function formatWindow(win) {
    if (!win?.date) return '—'
    return `${win.date} ${String(win.start ?? '').padStart(2,'0')}:00-${String(win.end ?? '').padStart(2,'0')}:00`
}

export default function Orders() {
    const navigate = useNavigate()
    const [orders, setOrders] = useState(null)
    const [error, setError] = useState('')
    const [expanded, setExpanded] = useState(null)

    useEffect(() => {
        let cancelled = false
        apiReq('order/mine', { limit: 20 }).then(data => {
            if (cancelled) return
            const list = Array.isArray(data) ? data : data?.orders || []
            setOrders(list)
        }).catch(e => {
            if (!cancelled) setError(e?.message || String(e))
        })
        return () => { cancelled = true }
    }, [])

    if (error) return <Flex col gap={12}><Text tag="h2" size="h3" bold>הזמנות</Text><Text mode="error">{error}</Text></Flex>
    if (orders === null) return <Flex center style={{ padding: 40 }}><Loader size={28} /></Flex>
    if (!orders.length) return (
        <div>
            <Text tag="h2" size="h3" bold style={{ marginBottom: 16 }}>הזמנות</Text>
            <Flex col gap={12} center style={{ padding: 40 }}>
                <Icon name="orders" size={32} />
                <Text mode="sub">אין הזמנות עדיין</Text>
                <Button onClick={() => navigate('/')}>להתחלת קנייה</Button>
            </Flex>
        </div>
    )

    return (
        <div>
            <Text tag="h2" size="h3" bold style={{ marginBottom: 16 }}>הזמנות ({orders.length})</Text>
            <div className={styles.orders}>
                {orders.map(order => {
                    const itemsCount = (order.cart || []).reduce((a, c) => a + (c.amount || 1), 0)
                    const total = order.finalSumWithShipping ?? order.sumWithShipping ?? order.finalSum ?? order.sum ?? 0
                    const isOpen = expanded === order.id
                    return (
                        <div key={order.id || order.number} className={styles.card}>
                            <div className={styles.cardHeader}>
                                <Text bold className={styles.number}>#{order.number}</Text>
                                <span className={`${styles.status} ${statusClass[order.status] || ''}`}>{order.status}</span>
                            </div>
                            <div className={styles.body}>
                                <div className={styles.row}>
                                    <Text className={styles.label}>תאריך</Text>
                                    <Text className={styles.value}>{formatDate(order.time || order.window?.leadTimestamp)}</Text>
                                </div>
                                <div className={styles.row}>
                                    <Text className={styles.label}>יעד</Text>
                                    <Text className={styles.value}>{order.deliveryMethod === 'pickup' ? 'איסוף' : 'משלוח'} {order.address ? `• ${order.address.city || ''} ${order.address.street || ''}`.trim() : ''}</Text>
                                </div>
                                <div className={styles.row}>
                                    <Text className={styles.label}>חלון אספקה</Text>
                                    <Text className={styles.value}>{formatWindow(order.window)}</Text>
                                </div>
                                <div className={styles.row}>
                                    <Text className={styles.label}>כמות</Text>
                                    <Text className={styles.value}>{itemsCount} פריטים</Text>
                                </div>
                            </div>
                            <div className={styles.footer}>
                                <button type="button" className={styles.viewBtn} onClick={() => setExpanded(isOpen ? null : order.id)}>
                                    {isOpen ? 'הסתר' : 'פרטים'}
                                </button>
                                <Text bold className={styles.total}>{render({ type: 'coin', value: total })}</Text>
                            </div>
                            {isOpen && order.cart?.length ? (
                                <Flex col gap={10} className={styles.items}>
                                    {order.cart.map((p, idx) => <ProductInline key={p.id || idx} product={p} remove={false} note={false} />)}
                                </Flex>
                            ) : null}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
