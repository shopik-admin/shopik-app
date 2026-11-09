import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Route, Routes, useLocation, useNavigate } from 'react-router'
import Button from 'common/components/Button'
import Product from 'pages/Product'
import styles from './productOverlay.module.css'

// Renders the product page above the current page when the product link was
// followed inside the app (the location carries `backgroundLocation`).
// The URL is a real product URL: refreshing or sharing it renders the full
// product page through the regular route.
export default function ProductOverlay() {
    const location = useLocation()
    const navigate = useNavigate()
    const backgroundLocation = location.state?.backgroundLocation
    const stateProduct = location.state?.product
    const stateSales = location.state?.sales
    const open = !!backgroundLocation

    // Card data arrives with the link, so the dialog shows a filled product on
    // the first paint; the page still fetches the full payload (specs, related
    // products, sales) and replaces it when it lands.
    const initialData = useMemo(
        () => stateProduct ? { data: { product: stateProduct, sales: stateSales || {} } } : undefined,
        [stateProduct, stateSales]
    )

    const previousFocusRef = useRef(null)
    const panelRef = useRef(null)
    // Read the header synchronously on the first client render so the dialog
    // never starts underneath the sticky header and then jumps down.
    const [headerHeight, setHeaderHeight] = useState(() => (
        typeof document === 'undefined'
            ? 0
            : document.querySelector('header')?.getBoundingClientRect().height || 0
    ))

    const close = useCallback(() => {
        // The overlay always pushed one history entry, so Back is the natural
        // close (and keeps the page behind it untouched).
        if (window.history.state?.idx > 0) navigate(-1)
        else navigate(backgroundLocation || '/', { replace: true })
    }, [navigate, backgroundLocation])

    // Escape closes the dialog.
    useEffect(() => {
        if (!open) return
        const onKeyDown = e => {
            if (e.key === 'Escape') close()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [open, close])

    // Keep the page behind the dialog still without touching body overflow:
    // `overflow: hidden` on <body> turns it into a scroll container, which
    // un-sticks the sticky header and makes it vanish when the page behind is
    // scrolled. Blocking the wheel/touch gestures keeps the header pinned.
    useEffect(() => {
        if (!open) return
        const panel = panelRef.current
        const block = e => {
            if (panel?.contains(e.target)) return
            e.preventDefault()
        }
        document.addEventListener('wheel', block, { passive: false })
        document.addEventListener('touchmove', block, { passive: false })
        return () => {
            document.removeEventListener('wheel', block)
            document.removeEventListener('touchmove', block)
        }
    }, [open])

    // The sticky header paints above this layer, so measure its height and keep
    // the dialog (and its full-screen mobile mode) below it.
    useEffect(() => {
        if (!open) return
        const header = document.querySelector('header')
        if (!header) return
        const update = () => setHeaderHeight(header.getBoundingClientRect().height)
        update()
        const observer = new ResizeObserver(update)
        observer.observe(header)
        window.addEventListener('resize', update)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', update)
        }
    }, [open])

    // Restore the background page's title/meta when the dialog closes, unless
    // the customer navigated somewhere else from inside it.
    useEffect(() => {
        if (!open) return
        const title = document.title
        const meta = document.querySelector("meta[name='description']")
        const description = meta?.getAttribute('content')
        const backgroundPath = decodeURIComponent(backgroundLocation?.pathname || '')
        return () => {
            if (!backgroundPath) return
            if (decodeURIComponent(window.location.pathname) !== backgroundPath) return
            document.title = title
            if (meta && description != null) meta.setAttribute('content', description)
        }
    }, [open, backgroundLocation?.pathname])

    // Return focus to whatever opened the dialog.
    useEffect(() => {
        if (!open) return
        previousFocusRef.current = document.activeElement
        return () => {
            const el = previousFocusRef.current
            if (el?.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true })
        }
    }, [open])

    if (!open) return null

    const panelRoot = document.getElementById('modal-root') || document.body

    return createPortal(
        <div
            className={styles.overlay}
            style={{ '--product-overlay-top': `${headerHeight}px` }}
            onClick={e => { if (e.target === e.currentTarget) close() }}
        >
            <div
                className={styles.panel}
                ref={panelRef}
                role='dialog'
                aria-modal='true'
                aria-label={stateProduct?.name || ''}
                onClick={e => e.stopPropagation()}
            >
                <div className={styles.scroll}>
                    <div className={styles.closeWrap}>
                        <Button
                            icon='x'
                            mode='text'
                            className={styles.close}
                            aria-label='close'
                            onClick={close}
                            autoFocus
                        />
                    </div>
                    <Routes location={location}>
                        <Route
                            path='product/:productId'
                            element={<Product modal initialData={initialData} />}
                        />
                    </Routes>
                </div>
            </div>
        </div>,
        panelRoot
    )
}
