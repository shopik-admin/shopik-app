import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import { isPushSupported, pushNeedsAttention, urlBase64ToUint8Array } from 'common/functions/pushClient'
import { useModal } from 'common/components/Modal'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import Icon from 'common/components/Icon'
import styles from './push.module.css'

const PushContext = createContext({
    ready: false,
    supported: false,
    enabled: false,
    permission: 'default',
    subscribed: false,
    needsAttention: false,
    requestPermission: async () => { },
    subscribe: async () => { },
    unsubscribe: async () => { },
    showPermissionHelp: () => { },
    refresh: async () => { }
})

export const usePush = () => useContext(PushContext)

function serviceWorkerReady(timeoutMs = 8000) {
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('service worker not ready')), timeoutMs))
    ])
}

function PermissionPrompt({ onAllow, onLater }) {
    const [loading, setLoading] = useState(false)

    async function allow() {
        setLoading(true)
        try {
            await onAllow()
        } finally {
            setLoading(false)
        }
    }

    return <Flex col gap={16} className={styles.prompt}>
        <Flex center className={styles.promptIcon}><Icon name='notifications' /></Flex>
        <Text bold size='l' center>הפעלת התראות</Text>
        <Text size='m' mode='sub' center>
            קבלו התראה על הזמנה חדשה להיום ועל חלון הזמנות שמוכן לאיסוף — גם כשהמערכת סגורה.
        </Text>
        <Flex gap={8} justifyContent='center' wrap>
            <Button onClick={allow} loading={loading}>אפשר התראות</Button>
            <Button mode='outline' onClick={onLater}>לא עכשיו</Button>
        </Flex>
    </Flex>
}

function PermissionHelp({ onClose }) {
    return <Flex col gap={14} className={styles.prompt}>
        <Flex center className={styles.promptIconWarning}><Icon name='warning' /></Flex>
        <Text bold size='l' center>ההתראות חסומות בדפדפן</Text>
        <Text size='m' mode='sub'>
            בעבר נחסמה האפשרות לקבל התראות מהאתר. כדי להפעיל מחדש:
        </Text>
        <Flex col gap={6} className={styles.helpList}>
            <Text size='m'>1. לוחצים על סמל המנעול ליד כתובת האתר.</Text>
            <Text size='m'>2. בוחרים "הגדרות אתר" ← "התראות".</Text>
            <Text size='m'>3. משנים ל"אפשר" ומרעננים את העמוד.</Text>
        </Flex>
        <Flex justifyContent='center'>
            <Button onClick={onClose}>הבנתי</Button>
        </Flex>
    </Flex>
}

export default function Push({ children }) {
    const [state, setState] = useState({
        ready: false,
        supported: false,
        enabled: false,
        permission: 'default',
        subscribed: false,
        publicKey: ''
    })
    const stateRef = useRef(state)
    stateRef.current = state
    const publicKeyRef = useRef('')
    const autoRanRef = useRef(false)
    const { openModal, closeModal } = useModal()

    const load = useCallback(async () => {
        if (!isPushSupported()) {
            setState({ ready: true, supported: false, enabled: false, permission: 'default', subscribed: false, publicKey: '' })
            return
        }

        const permission = window.Notification?.permission || 'default'
        let endpoint
        try {
            const registration = await serviceWorkerReady()
            const subscription = await registration.pushManager.getSubscription()
            endpoint = subscription?.endpoint
        } catch { }

        try {
            const res = await apiReq('push/status', { endpoint })
            publicKeyRef.current = res?.publicKey || ''
            setState({
                ready: true,
                supported: true,
                enabled: Boolean(res?.enabled),
                permission,
                subscribed: Boolean(res?.subscribed),
                publicKey: res?.publicKey || ''
            })
        } catch {
            setState({ ready: true, supported: true, enabled: false, permission, subscribed: false, publicKey: '' })
        }
    }, [])

    const subscribe = useCallback(async () => {
        const current = stateRef.current
        if (!current.supported || !current.enabled) return false
        if (!publicKeyRef.current) throw new Error('push is not configured')

        const registration = await serviceWorkerReady()
        let subscription = await registration.pushManager.getSubscription()
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKeyRef.current)
            })
        }

        const json = subscription.toJSON()
        await apiReq('push/subscribe', {
            endpoint: json.endpoint,
            keys: json.keys,
            expirationTime: json.expirationTime,
            userAgent: navigator.userAgent,
            deviceLabel: navigator.platform || ''
        })
        setState(prev => ({ ...prev, subscribed: true, permission: 'granted' }))
        return true
    }, [])

    const requestPermission = useCallback(async () => {
        const current = stateRef.current
        if (!current.supported || !current.enabled) return 'default'
        if (!('Notification' in window)) return 'denied'

        let permission = window.Notification.permission
        try {
            permission = await window.Notification.requestPermission()
        } catch {
            permission = window.Notification.permission
        }
        setState(prev => ({ ...prev, permission }))

        if (permission === 'granted') {
            try {
                await subscribe()
            } catch (e) {
                console.warn('push subscribe failed', e)
            }
        }
        return permission
    }, [subscribe])

    const showPermissionHelp = useCallback(() => {
        openModal(<PermissionHelp onClose={closeModal} />, { title: '' })
    }, [openModal, closeModal])

    const showPrompt = useCallback(() => {
        openModal(<PermissionPrompt
            onAllow={async () => {
                const permission = await requestPermission()
                closeModal()
                if (permission === 'denied') showPermissionHelp()
            }}
            onLater={closeModal}
        />, { title: '' })
    }, [openModal, closeModal, requestPermission, showPermissionHelp])

    const unsubscribe = useCallback(async () => {
        try {
            const registration = await serviceWorkerReady()
            const subscription = await registration.pushManager.getSubscription()
            if (subscription) {
                await apiReq('push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => { })
                await subscription.unsubscribe().catch(() => { })
            }
        } catch { }
        setState(prev => ({ ...prev, subscribed: false }))
    }, [])

    useEffect(() => {
        load()
    }, [load])

    // Once the status is known:
    //  - granted but not registered → register silently (no gesture needed)
    //  - default → open our own prompt immediately; the browser prompt itself
    //    only opens from the button inside it, because it needs a user gesture.
    useEffect(() => {
        if (!state.ready || autoRanRef.current) return
        if (!state.supported || !state.enabled) return
        autoRanRef.current = true

        if (state.permission === 'granted') {
            if (!state.subscribed) subscribe().catch(e => console.warn('push subscribe failed', e))
        } else if (state.permission === 'default') {
            showPrompt()
        }
    }, [state.ready, state.supported, state.enabled, state.permission, state.subscribed, subscribe, showPrompt])

    const needsAttention = pushNeedsAttention(state)

    return <PushContext.Provider value={{
        ...state,
        needsAttention,
        requestPermission,
        subscribe,
        unsubscribe,
        showPermissionHelp,
        refresh: load
    }}>
        {children}
    </PushContext.Provider>
}
