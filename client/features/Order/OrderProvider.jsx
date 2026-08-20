import { createContext, useContext, useEffect, useState } from 'react'
import { useAppData } from 'App'

const OrderContext = createContext()
export const useOrder = () => useContext(OrderContext)

export default function OrderProvider({ children }) {
    const
        { order: initialOrder = {} } = useAppData(),
        [order, setOrder] = useState(initialOrder)

    /* useEffect(() => {
        localStorage.cart = JSON.stringify(order?.cart)
    }, [order]) */

    return <OrderContext value={{ order, setOrder }}>
        {children}
    </OrderContext>
}   