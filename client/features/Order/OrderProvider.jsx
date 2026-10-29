import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { useAppData } from 'App'
import apiReq from '#common/functions/apiReq.js'
import { getSalesCache, setSalesCache } from '#common/functions/salesCache.js'

export const CART_SYNC_DEBOUNCE_MS = 300

const OrderContext = createContext({})
export const useOrder = () => useContext(OrderContext)

const readStoredCart = () => {
    try {
        if (typeof localStorage === 'undefined') return undefined
        const raw = localStorage.cart
        if (!raw) return undefined
        const cart = JSON.parse(raw)
        return Array.isArray(cart) ? cart : undefined
    } catch {
        return undefined
    }
}

export default function OrderProvider({ children }) {
    const { order: serverOrder } = useAppData()
    const hasServerOrder = !!serverOrder
    const [order, setOrder] = useState(hasServerOrder ? serverOrder : {})
    // Domain pricing is resolved server-side into a flat `price` — the client
    // carries no domain logic. The server re-resolves the domain per request
    // (router middleware), so sync payloads need no domainId either.
    const seqRef = useRef(0)
    const timersRef = useRef(new Map())
    const pendingRef = useRef(new Map())
    const queueRef = useRef(Promise.resolve())
    const unconfirmedRef = useRef(new Map())

    const sendCartSync = useCallback((product, amount) => {
        const seq = ++seqRef.current
        const task = () => apiReq('order/cart/product', { id: product.id, amount })
            .then(({ order: serverOrder, sales }) => {
                if (sales) setSalesCache(sales)
                const cur = unconfirmedRef.current.get(product.id)
                if (cur === amount) unconfirmedRef.current.delete(product.id)
                const hasPending = unconfirmedRef.current.size > 0 || timersRef.current.size > 0
                if (hasPending) return
                if (seq === seqRef.current && serverOrder) setOrder(serverOrder)
            }).catch(() => {
                const cur = unconfirmedRef.current.get(product.id)
                if (cur === amount) unconfirmedRef.current.delete(product.id)
            })
        queueRef.current = queueRef.current.then(task, task)
        return queueRef.current
    }, [])

    const queueCartSync = useCallback((product, amount) => {
        const id = product?.id
        if (!id) return
        unconfirmedRef.current.set(id, amount)
        pendingRef.current.set(id, { product, amount })
        if (timersRef.current.has(id)) clearTimeout(timersRef.current.get(id))
        const tid = setTimeout(() => {
            const pending = pendingRef.current.get(id)
            if (!pending) return
            pendingRef.current.delete(id)
            timersRef.current.delete(id)
            sendCartSync(pending.product, pending.amount)
        }, CART_SYNC_DEBOUNCE_MS)
        timersRef.current.set(id, tid)
    }, [sendCartSync])

    // Send every debounced cart edit now and resolve once the server has them.
    // Payment must wait for this: an edit still in the debounce window is only
    // in client state, so charging would use the previous server total.
    const flushCartSync = useCallback(() => {
        for (const [id, tid] of [...timersRef.current.entries()]) {
            clearTimeout(tid)
            timersRef.current.delete(id)
            const pending = pendingRef.current.get(id)
            if (!pending) continue
            pendingRef.current.delete(id)
            sendCartSync(pending.product, pending.amount)
        }
        return queueRef.current
    }, [sendCartSync])

    // Authoritative cart snapshot. The storefront can hold an optimistic or
    // stale cart (debounced edit, another tab/device), while payment charges
    // the server order — so checkout reconciles with this before showing a
    // total or starting a payment.
    const refreshCart = useCallback(async () => {
        try {
            await flushCartSync()
            const seq = seqRef.current
            const res = await apiReq('order/cart/get', {})
            const serverOrder = res?.order || res
            if (!serverOrder?.id) return null
            // A cart edit started while the snapshot was in flight: its own
            // response is newer, so this one must not overwrite it.
            if (seqRef.current !== seq) return null
            setOrder(prev => ({
                ...serverOrder,
                // Billing details are client-side until payment/create persists
                // them; a refresh must not wipe what the customer just typed.
                invoiceRequest: prev?.invoiceRequest !== undefined ? prev.invoiceRequest : serverOrder.invoiceRequest
            }))
            return serverOrder
        } catch {
            return null
        }
    }, [flushCartSync])

    useEffect(() => () => {
        for (const tid of timersRef.current.values()) clearTimeout(tid)
        timersRef.current.clear()
    }, [])

    useEffect(() => {
        if (hasServerOrder) return
        const cart = readStoredCart()
        if (!cart?.length) return
        setOrder({ cart })
        // Device-restored guest cart: recreate the server guest cart so sums,
        // sales and shipping come from the server. Display fallbacks cover
        // the gap until the responses arrive; failures keep the fallback.
        for (const item of cart) {
            const amount = Number(item?.amount) || 0
            if (item?.id && amount > 0) queueCartSync(item, amount)
        }
    }, [hasServerOrder])

    useEffect(() => {
        if (order?.cart) localStorage.cart = JSON.stringify(order.cart)
    }, [order])

    // Warm sales cache for existing cart items (fixes optimistic jump when sale missing)
    useEffect(() => {
        const cart = order?.cart || []
        if (!cart.length) return
        const saleIds = [...new Set(cart.flatMap(i => i.saleIds || []))]
        if (!saleIds.length) return
        const cache = getSalesCache()
        const missing = saleIds.filter(id => !cache[id])
        if (!missing.length) return
        const productIds = [...new Set(cart.map(i => i.id).filter(Boolean))]
        if (!productIds.length) return
        apiReq('product/get', { filter: { id: { $in: productIds } }, limit: productIds.length }).then(res => {
            if (res?.sales) setSalesCache(res.sales)
        }).catch(() => { })
    }, [order?.cart])

    return <OrderContext value={{ order, setOrder, queueCartSync, refreshCart }}>
        {children}
    </OrderContext>
}   