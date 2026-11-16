import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import apiReq from 'common/functions/apiReq'
import Popover from 'common/components/Popover'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import Button from 'common/components/Button'
import Loader from 'common/components/Loader'
import classNames from 'common/functions/classNames'
import usePermission from 'common/permissions/usePermision'
import { NOTIFICATION_LEVEL_ICONS, PUSH_CONFIG_REASONS, relativeTime } from 'common/functions/pushClient'
import { usePush } from 'features/Push'
import styles from './notificationBell.module.css'

const LEVEL_CLASS = {
    success: styles.levelSuccess,
    warning: styles.levelWarning,
    error: styles.levelError,
    info: styles.levelInfo
}

// Deployment problems: the admin can do nothing from here, so they are shown
// as a diagnostic line to superadmins instead of a "grant permission" banner.
const CONFIG_REASON_TEXT = {
    'insecure-context': 'התראות דחיפה דורשות חיבור מאובטח (HTTPS).',
    unsupported: 'הדפדפן הזה לא תומך בהתראות דחיפה.',
    'not-configured': 'התראות דחיפה לא מוגדרות בשרת (חסרים מפתחות VAPID).'
}

export default function NotificationBell() {
    const push = usePush()
    const navigate = useNavigate()
    const canSendTest = usePermission('push:send')
    const isSuperAdmin = usePermission('admin:super')
    const [items, setItems] = useState([])
    const [unread, setUnread] = useState(0)
    const [loading, setLoading] = useState(true)
    const [marking, setMarking] = useState(false)
    const [testState, setTestState] = useState('')

    const loadInbox = useCallback(async () => {
        try {
            const res = await apiReq('notifications/inbox', { limit: 30 })
            setItems(res?.items || [])
            setUnread(Number(res?.unread) || 0)
        } catch {
            // Keep the last known list; the bell is not worth an error screen.
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadInbox()
        const onFocus = () => loadInbox()
        window.addEventListener('focus', onFocus)

        const onMessage = event => {
            if (event.data?.type === 'push-received') loadInbox()
        }
        navigator.serviceWorker?.addEventListener?.('message', onMessage)

        return () => {
            window.removeEventListener('focus', onFocus)
            navigator.serviceWorker?.removeEventListener?.('message', onMessage)
        }
    }, [loadInbox])

    function handleBellClick(event) {
        if (!push.ready || !push.supported || !push.enabled) return

        if (push.permission === 'denied') {
            // The browser will not show its prompt again; instructions are the
            // only path forward, so do not stack the inbox behind the modal.
            event.stopPropagation()
            event.preventDefault()
            push.showPermissionHelp()
            return
        }

        if (push.permission === 'default') {
            push.requestPermission()
                .then(permission => {
                    if (permission === 'denied') push.showPermissionHelp()
                })
                .catch(() => { })
            return
        }

        if (!push.subscribed)
            push.subscribe().catch(() => { })
    }

    async function markAllRead() {
        setMarking(true)
        try {
            await apiReq('notifications/mark_all_read')
            const now = new Date().toISOString()
            setItems(prev => prev.map(item => item.readAt ? item : { ...item, readAt: now }))
            setUnread(0)
        } catch { } finally {
            setMarking(false)
        }
    }

    function openItem(item, close) {
        if (!item.readAt) {
            apiReq('notifications/mark_read', { id: item.id }).catch(() => { })
            setItems(prev => prev.map(row => row.id === item.id
                ? { ...row, readAt: new Date().toISOString() }
                : row))
            setUnread(count => Math.max(0, count - 1))
        }
        close?.()
        if (item.url) navigate(item.url)
    }

    async function sendTest() {
        setTestState('loading')
        try {
            await apiReq('push/test')
            setTestState('ok')
        } catch (error) {
            setTestState(error?.message || 'error')
        }
        setTimeout(() => setTestState(''), 4000)
    }

    const permissionAction = push.permission === 'denied'
        ? push.showPermissionHelp
        : push.error
            // Permission is already granted; only the registration failed.
            ? () => push.subscribe().catch(() => { })
            : () => push.requestPermission().catch(() => { })

    // A deployment problem cannot be fixed from the bell, so it gets its own
    // indicator: without it the feature looks like it silently vanished.
    const configIssue = isSuperAdmin && !push.needsAttention && PUSH_CONFIG_REASONS.includes(push.reason)

    return <Popover
        id='admin-notification-inbox'
        overlay
        btnClassName={styles.trigger}
        button={<button type='button' className={styles.bell} aria-label='התראות' onClick={handleBellClick}>
            <Icon name='notifications' />
            {push.needsAttention
                ? <span className={styles.dot} />
                : configIssue ? <span className={styles.dotWarning} /> : null}
            {unread > 0 ? <span className={styles.count}>{unread > 99 ? '99+' : unread}</span> : null}
        </button>}
    >
        {({ close }) => <div className={styles.content}>
            <Flex alignItems='center' justifyContent='space-between' className={styles.header}>
                <Flex alignItems='center' gap={8}>
                    <Text bold size='l'>תיבת הודעות</Text>
                    {unread > 0 ? <Flex center className={styles.unreadCircle}>{unread > 99 ? '99+' : unread}</Flex> : null}
                </Flex>
                {unread > 0 ? <Button mode='text-brand' text='סמן הכל כנקרא' onClick={markAllRead} loading={marking} /> : null}
            </Flex>

            {push.needsAttention ? <Flex alignItems='center' gap={8} className={styles.permissionBanner}>
                <Icon name='warning' className={styles.bannerIcon} />
                <Text size='s' className={styles.bannerText}>
                    {push.permission === 'denied'
                        ? 'ההתראות חסומות בדפדפן. אפשר להפעיל אותן בהגדרות האתר.'
                        : push.error
                            ? 'ההתראות אושרו בדפדפן אבל לא נרשמו במכשיר. נסו שוב או רעננו את העמוד.'
                            : 'התראות הדפדפן עדיין לא הופעלו במכשיר הזה.'}
                </Text>
                <Button
                    mode='text-brand'
                    text={push.permission === 'denied' ? 'איך מפעילים?' : push.error ? 'נסה שוב' : 'אפשר'}
                    onClick={permissionAction}
                />
            </Flex> : null}

            {configIssue ? <Flex alignItems='center' gap={8} className={styles.configBanner}>
                <Icon name='warning' className={styles.bannerIcon} />
                <Text size='s' className={styles.bannerText}>{CONFIG_REASON_TEXT[push.reason]}</Text>
            </Flex> : null}

            <div className={styles.list}>
                {loading ? <Flex center className={styles.state}><Loader size={20} /></Flex> : null}

                {!loading && !items.length ? <Flex col center gap={8} className={styles.state}>
                    <Icon name='notifications' className={styles.emptyIcon} />
                    <Text size='s' mode='sub'>אין הודעות חדשות</Text>
                </Flex> : null}

                {!loading && items.map(item => <Flex
                    key={item.id}
                    alignItems='start'
                    gap={10}
                    className={classNames(styles.row, !item.readAt && styles.unread)}
                    onClick={() => openItem(item, close)}
                    role='button'
                    tabIndex={0}
                    onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') openItem(item, close)
                    }}
                >
                    <Flex center className={classNames(styles.rowIcon, LEVEL_CLASS[item.level] || LEVEL_CLASS.info)}>
                        <Icon name={NOTIFICATION_LEVEL_ICONS[item.level] || 'info'} />
                    </Flex>
                    <Flex col gap={4} grow={1}>
                        <Flex alignItems='center' justifyContent='space-between' gap={8}>
                            <Flex alignItems='center' gap={6}>
                                <Text bold={!item.readAt} size='m'>{item.title}</Text>
                                {item.orderNumber ? <span className={styles.orderChip}>#{item.orderNumber}</span> : null}
                            </Flex>
                            <Text size='xs' mode='sub' className={styles.time}>{relativeTime(item.createdAt)}</Text>
                        </Flex>
                        {item.body ? <Text size='s' mode='sub'>{item.body}</Text> : null}
                    </Flex>
                </Flex>)}
            </div>

            {push.supported && push.enabled && !push.needsAttention && canSendTest
                ? <Flex alignItems='center' justifyContent='space-between' className={styles.footer}>
                    <Text size='xs' mode='sub'>ההתראות פעילות במכשיר הזה</Text>
                    <Button
                        mode='text-brand'
                        text={testState === 'loading' ? 'שולח...' : testState === 'ok' ? 'נשלחה' : 'שלח בדיקה'}
                        onClick={sendTest}
                        disabled={testState === 'loading'}
                    />
                </Flex>
                : null}

            {isSuperAdmin ? <Flex alignItems='center' gap={6} className={styles.diagnostic} dir='ltr'>
                <Text size='xs' mode='sub'>push:</Text>
                <Text size='xs' mode='sub' className={styles.diagnosticValue}>
                    {`enabled=${push.enabled ? 'yes' : 'no'} permission=${push.permission} subscribed=${push.subscribed ? 'yes' : 'no'} reason=${push.reason}`}
                </Text>
            </Flex> : null}
        </div>}
    </Popover>
}
