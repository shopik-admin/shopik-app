import { createContext, useContext, useEffect, useState } from 'react'
import { useAppData } from 'App'
import apiReq from '#common/functions/apiReq.js'
import { getSalesCache, setSalesCache } from '#common/functions/salesCache.js'

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

    return <OrderContext value={{ order, setOrder }}>
        {children}
    </OrderContext>
}   