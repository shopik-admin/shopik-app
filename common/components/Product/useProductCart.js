import { useMemo } from 'react'
import { useOrder } from 'features/Order/OrderProvider'
import { useAppData } from 'App'
import { useUser } from 'features/User'
import calcOrder from 'common/functions/calcOrder/cart.js'
import { extractShippingConfig } from '#common/functions/shipping.js'
import { getSalesCache, setSalesCache } from '#common/functions/salesCache.js'

export function useProductCart(product, sales = {}) {
    const { order = {}, setOrder, queueCartSync } = useOrder()
    const { settings } = useAppData() || {}
    const shippingConfig = useMemo(() => extractShippingConfig(settings), [settings])
    const user = useUser()
    const amount = order?.cart?.find(item => item.id === product?.id)?.amount ?? product?.amount ?? 0

    const updateAmount = (newAmount) => {
        if (sales && Object.keys(sales).length) setSalesCache(sales)
        const cachedSales = getSalesCache()
        const neededIds = [...new Set([...(order?.cart || []).flatMap(i => i.saleIds || []), ...(product.saleIds || [])])]
        const missing = neededIds.filter(id => !cachedSales[id])
        if (!missing.length) {
            const optimisticOrder = calcOrder({
                order: order || {},
                product,
                amount: newAmount,
                sales: cachedSales,
                shippingConfig,
                user
            })
            setOrder(optimisticOrder)
        } else {
            console.log('skip optimistic - missing sales', missing)
        }
        queueCartSync(product, newAmount)
    }

    const remove = () => {
        const effectiveSales = getSalesCache()
        const remainingCart = (order?.cart || []).filter(i => i.id !== product.id)
        const neededIds = [...new Set(remainingCart.flatMap(i => i.saleIds || []))]
        const missing = neededIds.filter(id => !effectiveSales[id])
        if (!missing.length) {
            const updatedOrder = calcOrder({
                order,
                product,
                amount: 0,
                sales: effectiveSales,
                shippingConfig,
                user
            })
            setOrder(updatedOrder)
        } else {
            console.log('skip optimistic remove - missing sales', missing)
        }
        queueCartSync(product, 0)
    }

    const saleIdForTotal = product?.saleIds?.[0]
    const saleTotalAmount = (() => {
        if (!saleIdForTotal) return amount
        const cart = order?.cart || []
        if (!cart.length) return amount
        const hasSaleInCart = cart.some(item => (item.saleIds || []).includes(saleIdForTotal))
        if (!hasSaleInCart) return amount
        const total = cart
            .filter(item => (item.saleIds || []).includes(saleIdForTotal))
            .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
        return total || amount
    })()

    const effectiveSalesForChild = (() => {
        if (sales && Object.keys(sales).length) return sales
        let cache
        try { cache = getSalesCache() } catch { cache = null }
        if (cache && Object.keys(cache).length) return cache
        const os = order?.sales
        if (os && Object.keys(os).length) {
            const firstVal = os[Object.keys(os)[0]]
            if (firstVal && firstVal.amount != null) return os
            if (cache && Object.keys(cache).length) return cache
        }
        if (os && Object.keys(os).length) return os
        return undefined
    })()

    return { amount, updateAmount, remove, saleTotalAmount, effectiveSalesForChild, order }
}
