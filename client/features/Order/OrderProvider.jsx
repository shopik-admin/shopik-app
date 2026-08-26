import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAppData } from 'App'

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

    const contextValue = useMemo(() => ({ order, setOrder }), [order])

    return <OrderContext value={contextValue}>
        {children}
    </OrderContext>
}