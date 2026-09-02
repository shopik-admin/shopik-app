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

    return <CommonProductInline
        product={product}
        sales={sales}
        remove={remove}
        note={note}
        amount={amount}
        onRemove={remove ? handleRemove : undefined}
        onUpdateAmount={handleUpdateAmount}
        {...props}
    />
}
