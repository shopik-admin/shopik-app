import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import apiReq from 'common/functions/apiReq'

// General notification badge counts.
//
// The server owns the sources (server/services/notifications): this provider
// only fetches the numbers the current admin may see and exposes them to any
// badge. Counters are cheap, so refresh on mount and whenever the tab regains
// focus — enough for the "something needs attention" dot without polling.
const NotificationsContext = createContext({ counts: {}, refresh: () => { } })

export const useNotifications = () => useContext(NotificationsContext)

export function useNotificationCount(key) {
    const { counts } = useNotifications()
    return Number(counts?.[key]) || 0
}

export default function Notifications({ children }) {
    const [counts, setCounts] = useState({})
    const reqId = useRef(0)

    const refresh = useCallback(async () => {
        const id = ++reqId.current
        try {
            const res = await apiReq('notifications/counts')
            // Focus can fire while an older request is still in flight.
            if (id === reqId.current) setCounts(res?.counts || {})
        } catch { }
    }, [])

    useEffect(() => {
        refresh()
        const onFocus = () => refresh()
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
    }, [refresh])

    return <NotificationsContext.Provider value={{ counts, refresh }}>
        {children}
    </NotificationsContext.Provider>
}
