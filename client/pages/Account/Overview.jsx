import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import Loader from 'common/components/Loader'
import { useUser } from 'features/User'
import apiReq from 'common/functions/apiReq'
import render from 'common/functions/render.js'
import styles from './Overview.module.css'

export default function Overview() {
    const user = useUser()
    const navigate = useNavigate()
    const [orders, setOrders] = useState(null)
    const firstName = user?.name?.first || ''
    const defaultAddress = (user?.addresses || []).find(a => a.active) || (user?.addresses || [])[0] || null
    const ordersCount = orders?.length ?? '—'

    useEffect(() => {
        let cancelled = false
        apiReq('order/mine', { limit: 3 }).then(data => {
            if (cancelled) return
            const list = Array.isArray(data) ? data : data?.orders || []
            setOrders(list)
        }).catch(() => { if (!cancelled) setOrders([]) })
        return () => { cancelled = true }
    }, [])

    return (
        <div className={styles.overview}>
            <div className={styles.greeting}>
                <Text tag="h2" size="h3" bold>שלום{firstName ? `, ${firstName}` : ''}!</Text>
                <Text size="s" mode="sub" style={{ marginTop: 6 }}>ברוכים הבאים לאזור האישי שלך</Text>
            </div>

            <Flex gap={16} wrap className={styles.stats}>
                <div className={styles.statCard}>
                    <Text className={styles.statValue}>{orders === null ? '—' : orders.length}</Text>
                    <Text className={styles.statLabel}>הזמנות</Text>
                    <button type="button" className={styles.linkBtn} onClick={() => navigate('/account/orders')}>צפייה</button>
                </div>
                <div className={styles.statCard}>
                    <Text className={styles.statValue}>{(user?.addresses || []).length}</Text>
                    <Text className={styles.statLabel}>כתובות שמורות</Text>
                    <button type="button" className={styles.linkBtn} onClick={() => navigate('/account/addresses')}>ניהול</button>
                </div>
                <div className={styles.statCard}>
                    <Text className={styles.statValue} style={{ fontSize: 'var(--text-md)', wordBreak: 'break-all' }}>{user?.phone || user?.email || '—'}</Text>
                    <Text className={styles.statLabel}>פרטי קשר</Text>
                    <button type="button" className={styles.linkBtn} onClick={() => navigate('/account/details')}>עריכה</button>
                </div>
            </Flex>

            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <Text bold>הזמנות אחרונות</Text>
                    <button type="button" className={styles.linkBtn} onClick={() => navigate('/account/orders')}>כל ההזמנות</button>
                </div>
                {orders === null ? <Flex center style={{ padding: 20 }}><Loader size={20} /></Flex>
                    : !orders.length ? <Text mode="sub">אין הזמנות עדיין</Text>
                    : orders.map(o => (
                        <div key={o.id || o.number} className={styles.orderRow}>
                            <Flex gap={8} alignItems="center">
                                <Text bold size="s">#{o.number}</Text>
                                <Text size="xs" mode="sub">{o.status}</Text>
                            </Flex>
                            <Text size="s" bold>{render({ type: 'coin', value: o.finalSumWithShipping ?? o.sumWithShipping ?? o.sum ?? 0 })}</Text>
                        </div>
                    ))}
            </div>

            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <Text bold>כתובת ברירת מחדל</Text>
                    <button type="button" className={styles.linkBtn} onClick={() => navigate('/account/addresses')}>ניהול</button>
                </div>
                {defaultAddress ? (
                    <Text size="s">{defaultAddress.street} {defaultAddress.building}{defaultAddress.city ? `, ${defaultAddress.city}` : ''}</Text>
                ) : <Text mode="sub">לא הוגדרה כתובת</Text>}
            </div>
        </div>
    )
}
