import CommonProductInline from 'common/components/ProductInline'
import { useOrder } from 'features/Order/OrderProvider'
import calcOrder from 'common/functions/calcOrder/cart.js'
import { useAppData } from 'App'
import { useUser } from 'features/User'
import { useMemo } from 'react'
import { extractShippingConfig } from '#common/functions/shipping.js'
import { getSalesCache, setSalesCache } from '#common/functions/salesCache.js'

export default function ProductInline({ remove = true, note = true, product, sales, ...props }) {
    const { order = {}, setOrder, queueCartSync } = useOrder()
    const { settings } = useAppData() || {}
    const shippingConfig = useMemo(() => extractShippingConfig(settings), [settings])
    const user = useUser()
    const amount = order?.cart?.find(item => item.id === product?.id)?.amount ?? product?.amount ?? 0
    // Compute total quantity for the sale across the entire cart.
    // Must NOT depend on getSalesCache warming – aggregate by saleId directly so page-load is correct.
    // Using direct calculation (no useMemo) avoids stale cache closure; cost is trivial.
    const saleIdForTotal = product?.saleIds?.[0]
    const saleTotalAmount = (() => {
        if (!saleIdForTotal) return amount
        const cart = order?.cart || []
        // If cart is empty on first render, fall back to per-product amount
        if (!cart.length) return amount
        const hasSaleInCart = cart.some(item => (item.saleIds || []).includes(saleIdForTotal))
        if (!hasSaleInCart) return amount
        const total = cart
            .filter(item => (item.saleIds || []).includes(saleIdForTotal))
            .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
        return total || amount
    })()

    function handleRemove() {
        if (product) {
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
    }

    function handleUpdateAmount(newAmount) {
        if (sales && Object.keys(sales).length) setSalesCache(sales)
        const effectiveSales = getSalesCache()
        const neededIds = [...new Set([...(order?.cart || []).flatMap(i => i.saleIds || []), ...(product.saleIds || [])])]
        const missing = neededIds.filter(id => !effectiveSales[id])
        if (!missing.length) {
            const optimisticOrder = calcOrder({
                order: order || {},
                product,
                amount: newAmount,
                sales: effectiveSales,
                shippingConfig,
                user
            })
            setOrder(optimisticOrder)
        } else {
            console.log('skip optimistic - missing sales', missing)
        }

        queueCartSync(product, newAmount)
    }

    // Pass effective sales map so Common's getFirstSale finds the sale.
    // IMPORTANT: order.sales after optimistic calcOrder becomes minimal cartSaleDetails (without amount/price),
    // so we must NOT use it when the full cache is available. Prefer cache, then full order.sales, then prop.
    const effectiveSalesForChild = (() => {
        if (sales && Object.keys(sales).length) return sales
        let cache
        try { cache = getSalesCache() } catch { cache = null }
        if (cache && Object.keys(cache).length) return cache
        // Only use order.sales if it looks like a full sale (has amount)
        const os = order?.sales
        if (os && Object.keys(os).length) {
            const firstVal = os[Object.keys(os)[0]]
            if (firstVal && firstVal.amount != null) return os
            // minimal map (used:true) – fall back to cache or undefined and let getFirstSale try cache
            if (cache && Object.keys(cache).length) return cache
        }
        if (os && Object.keys(os).length) return os
        return undefined
    })()

    return <CommonProductInline
        product={product}
        sales={effectiveSalesForChild}
        remove={remove}
        note={note}
        amount={amount}
        saleTotalAmount={saleTotalAmount}
        onRemove={remove ? handleRemove : undefined}
        onUpdateAmount={handleUpdateAmount}
        {...props}
    />
}
