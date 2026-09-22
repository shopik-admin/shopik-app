import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useAppData } from 'App'
import apiReq from '#common/functions/apiReq.js'
import { getSalesCache, setSalesCache } from '#common/functions/salesCache.js'

export const CART_SYNC_DEBOUNCE_MS = 300

const OrderContext = createContext()
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
    const orderRef = useRef(order)
    // Tenant-routing id needed for optimistic pricing (buildCartProduct) and
    // cart sync payloads. Latched from the first order that carries it and
    // re-injected when a server response arrives without it (e.g. filtered
    // payloads), so optimistic updates keep working across syncs.
    const domainIdRef = useRef(serverOrder?.domainId)
    useEffect(() => {
        orderRef.current = order
        if (order?.domainId) domainIdRef.current = order.domainId
    }, [order])
    const seqRef = useRef(0)
    const timersRef = useRef(new Map())
    const pendingRef = useRef(new Map())
    const queueRef = useRef(Promise.resolve())
    const unconfirmedRef = useRef(new Map())
    // Preserve domainId across all state updates (supports both value and
    // functional forms), so filtered server payloads can never drop it.
    const setOrderWithDomain = (updater) => setOrder((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        if (next && typeof next === 'object' && !next.domainId) {
            const fallback = prev?.domainId ?? domainIdRef.current
            if (fallback) return { ...next, domainId: fallback }
        }
        return next
    })

    const queueCartSync = (product, amount) => {
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
            const seq = ++seqRef.current
            const domainId = orderRef.current?.domainId ?? domainIdRef.current
            const task = () => apiReq('order/cart/product', { id: pending.product.id, amount: pending.amount, domainId })
                .then(({ order: serverOrder, sales }) => {
                    if (sales) setSalesCache(sales)
                    const cur = unconfirmedRef.current.get(pending.product.id)
                    if (cur === pending.amount) unconfirmedRef.current.delete(pending.product.id)
                    const hasPending = unconfirmedRef.current.size > 0 || timersRef.current.size > 0
                    if (hasPending) return
                    if (seq === seqRef.current && serverOrder) setOrderWithDomain(serverOrder)
                }).catch(() => {
                    const cur = unconfirmedRef.current.get(pending.product.id)
                    if (cur === pending.amount) unconfirmedRef.current.delete(pending.product.id)
                })
            queueRef.current = queueRef.current.then(task, task)
        }, CART_SYNC_DEBOUNCE_MS)
        timersRef.current.set(id, tid)
    }

    useEffect(() => () => {
        for (const tid of timersRef.current.values()) clearTimeout(tid)
        timersRef.current.clear()
    }, [])

    useEffect(() => {
        if (hasServerOrder) return
        const cart = readStoredCart()
        if (cart) setOrder({ cart })
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

    return <OrderContext value={{ order, setOrder: setOrderWithDomain, queueCartSync }}>
        {children}
    </OrderContext>
}   