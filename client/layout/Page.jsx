import { useLocation, useParams, matchPath } from 'react-router'
import pages from 'pages'
import { useAppData } from 'App'
import { useOrder } from 'features/Order/OrderProvider'
import { useEffect, useState } from 'react'

export function usePage(initialData, { live = false } = {}) {
    const { pathname } = useLocation()
    const params = useParams()
    const appData = useAppData()
    const { order } = useOrder()
    // Products and display blocks are scoped to the customer's store, so a store
    // change (new address or pickup store) has to re-run the page's fetch even when
    // the path itself did not change. prevStore records the store the current data
    // was fetched with — an address change makes the two differ.
    const storeKey = order?.storeId || ''
    const page = pages.find(p =>
        matchPath({ path: p.path, end: true }, pathname)
    )
    // SSR initData belongs to the landing URL only. Reusing it for a different
    // path (client-side nav mounts a fresh component) flashes the landing
    // page's content — e.g. home banners on every page.
    const ssrUrl = (appData.url || '').split('?')[0]
    const isSsrPath = !!ssrUrl && decodeURIComponent(ssrUrl) === decodeURIComponent(pathname)
    const [data, setData] = useState(() => ({ ...(initialData || (isSsrPath ? appData.initData : null) || {}), prevStore: storeKey }))
    const [loading, setLoading] = useState(!initialData && !isSsrPath)
    // Live mode starts from a provisional card payload; this flag tells the page
    // that detail-only fields (specs, related products) are still on their way.
    const [refreshing, setRefreshing] = useState(live && !!initialData)

    useEffect(() => {
        if (initialData && !live) {
            if (data.prevPath !== pathname) {
                setData({ ...initialData, prevPath: pathname, prevStore: storeKey })
            }
            return
        }
        // Live mode (product overlay): the caller supplied a provisional payload
        // from the list card. Render it at once, then replace it with the full
        // response — no loading flash while the page's init runs.
        if (live && initialData && data.prevPath !== pathname) {
            setData({ ...initialData, prevPath: pathname, prevStore: storeKey })
        }
        const pathChanged = live
            ? data.prevPath !== pathname
            : (data.prevPath || appData.url) !== pathname
        const storeChanged = data.prevStore !== storeKey
        if (!pathChanged && !storeChanged) return
        if (!live || !data.data?.product) setLoading(true)
        if (live && initialData) setRefreshing(true)
        page.element.init?.(decodeURI(pathname))
            .then(pageData => {
                pageData.prevPath = pathname
                pageData.prevStore = storeKey
                setData(pageData)
                document.title = `${appData.settings?.appearance?.siteName?.trim() || 'Shopik'} | ${pageData.title}`
                document.querySelector("meta[name='description']")
                    ?.setAttribute('content', pageData.description || '')
            })
            // A failed refresh must not blank a product the card already showed.
            .catch(() => setData(prev =>
                live && prev.data?.product
                    ? prev
                    : { notFound: true, title: '404', prevPath: pathname, prevStore: storeKey }
            ))
            .finally(() => {
                setLoading(false)
                setRefreshing(false)
            })
    }, [page.path, params, pathname, initialData, storeKey])

    return {
        page,
        params,
        pageData: data,
        loading,
        refreshing,
        path: decodeURIComponent(pathname),
        storeKey
    }
}
