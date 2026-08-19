import { createContext, useContext, useState } from 'react'
import { useAppData } from 'App'

const OrderContext = createContext()
export const useOrder = () => useContext(OrderContext)

export default function OrderProvider({ children }) {
    const { order: initialOrder = {} } = useAppData()
    const [order, setOrder] = useState(initialOrder)

    return <OrderContext value={{ order, setOrder }}>
        {children}
    </OrderContext>
}   