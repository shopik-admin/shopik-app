import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import { useText } from 'common/texts/TextProvider'
import { pushNeedsAttention, pushReason, pushSupport, urlBase64ToUint8Array } from 'common/functions/pushClient'
import { useModal } from 'common/components/Modal'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import Icon from 'common/components/Icon'
import styles from './push.module.css'

const PushContext = createContext({
    ready: false,
    supported: false,
    supportReason: 'unsupported',
    enabled: false,
    permission: 'default',
    subscribed: false,
    needsAttention: false,
    reason: 'unsupported',
    error: '',
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

// Status lookup must not wait for an active worker: `ready` never settles until
// a registration exists, which would delay the permission prompt by the whole
// timeout. `getRegistration` resolves immediately (or with undefined).
async function serviceWorkerRegistration() {
    if (!('serviceWorker' in navigator)) return null
    try {
        return await navigator.serviceWorker.getRegistration()
    } catch {
        return null
    }
}

function PermissionPrompt({ onAllow, onLater }) {
    const { TR } = useText()
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
        <Text bold size='l' center>{TR('push_prompt_title')}</Text>
        <Text size='m' mode='sub' center>{TR('push_prompt_body')}</Text>
        <Flex gap={8} justifyContent='center' wrap>
            <Button onClick={allow} loading={loading}>{TR('push_prompt_allow')}</Button>
            <Button mode='outline' onClick={onLater}>{TR('push_prompt_later')}</Button>
        </Flex>
    </Flex>
}

function PermissionHelp({ onClose }) {
    const { TR } = useText()
    return <Flex col gap={14} className={styles.prompt}>
        <Flex center className={styles.promptIconWarning}><Icon name='warning' /></Flex>
        <Text bold size='l' center>{TR('push_help_title')}</Text>
        <Text size='m' mode='sub'>{TR('push_help_intro')}</Text>
        <Flex col gap={6} className={styles.helpList}>
            <Text size='m'>{TR('push_help_step1')}</Text>
            <Text size='m'>{TR('push_help_step2')}</Text>
            <Text size='m'>{TR('push_help_step3')}</Text>
        </Flex>
        <Flex justifyContent='center'>
            <Button onClick={onClose}>{TR('push_help_ok')}</Button>
        </Flex>
    </Flex>
}

export default function Push({ children }) {
    const [state, setState] = useState({
        ready: false,
        supported: false,
        supportReason: 'unsupported',
        enabled: false,
        permission: 'default',
        subscribed: false,
        publicKey: '',
        error: ''
    })
    const stateRef = useRef(state)
    stateRef.current = state
    const publicKeyRef = useRef('')
    const autoRanRef = useRef(false)
    const { openModal, closeModal } = useModal()

    const load = useCallback(async () => {
        const support = pushSupport()
        if (!support.supported) {
            // A plain-HTTP test host and an unsupported browser both fail here;
            // keep the reason so the bell can say which one instead of nothing.
            console.debug('[push] disabled:', support.reason)
            setState({
                ready: true,
                supported: false,
                supportReason: support.reason,
                enabled: false,
                permission: 'default',
                subscribed: false,
                publicKey: '',
                error: ''
            })
            return
        }

        const permission = window.Notification?.permission || 'default'
        let endpoint
        try {
            const registration = await serviceWorkerRegistration()
            const subscription = await registration?.pushManager?.getSubscription()
            endpoint = subscription?.endpoint
        } catch { }

        try {
            const res = await apiReq('push/status', { endpoint })
            publicKeyRef.current = res?.publicKey || ''
            if (!res?.enabled) console.debug('[push] server not configured (VAPID)')
            setState({
                ready: true,
                supported: true,
                supportReason: 'ok',
                enabled: Boolean(res?.enabled),
                permission,
                subscribed: Boolean(res?.subscribed),
                publicKey: res?.publicKey || '',
                error: ''
            })
        } catch (e) {
            console.debug('[push] status failed:', e?.message || e)
            setState({
                ready: true,
                supported: true,
                supportReason: 'ok',
                enabled: false,
                permission,
                subscribed: false,
                publicKey: '',
                error: ''
            })
        }
    }, [])

    const subscribe = useCallback(async () => {
        const current = stateRef.current
        if (!current.supported || !current.enabled) return false
        if (!publicKeyRef.current) throw new Error('push is not configured')

        try {
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
            setState(prev => ({ ...prev, subscribed: true, permission: 'granted', error: '' }))
            return true
        } catch (e) {
            // Keep the reason so the bell can say "not active on this device"
            // instead of silently showing a red dot forever.
            setState(prev => ({ ...prev, subscribed: false, error: e?.message || 'subscribe-failed' }))
            throw e
        }
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
    const reason = pushReason(state)

    return <PushContext.Provider value={{
        ...state,
        needsAttention,
        reason,
        requestPermission,
        subscribe,
        unsubscribe,
        showPermissionHelp,
        refresh: load
    }}>
        {children}
    </PushContext.Provider>
}
