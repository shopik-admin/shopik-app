import CommonProductInline from 'common/components/ProductInline'
import { useOrder } from 'features/Order/OrderProvider'
import calcOrder from 'common/functions/calcOrder/cart.js'
import apiReq from 'common/functions/apiReq.js'
import { useAppData } from 'App'
import { useUser } from 'features/User'
import { useMemo, useRef } from 'react'
import { extractShippingConfig } from '#common/functions/shipping.js'
import { getSalesCache, setSalesCache } from '#common/functions/salesCache.js'

export default function ProductInline({ remove = true, note = true, product, sales, ...props }) {
    const { order = {}, setOrder } = useOrder()
    const { settings } = useAppData() || {}
    const shippingConfig = useMemo(() => extractShippingConfig(settings), [settings])
    const user = useUser()
    const latestRequest = useRef(0)
    const amount = order?.cart?.find(item => item.id === product?.id)?.amount ?? product?.amount ?? 0

    function handleRemove() {
        if (product) {
            const cachedSales = getSalesCache()
            const filteredSales = Object.fromEntries(Object.entries(cachedSales).filter(([, v]) => v && typeof v === 'object' && ('kind' in v || 'price' in v)))
            const effectiveSales = Object.keys(filteredSales).length ? filteredSales : cachedSales
            const neededIds = [...new Set((order?.cart || []).map(i => i.saleIds[0] || []))]
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
            // keep server in sync for removal
            apiReq('order/cart/product', {
                id: product.id,
                amount: 0,
                domainId: order?.domainId
            }).then(({ order: serverOrder, sales: returnedSales }) => {
                if (returnedSales) setSalesCache(returnedSales)
                if (serverOrder) setOrder(serverOrder)
            }).catch(() => { })
        }
    }

    function handleUpdateAmount(newAmount) {
        const currentRequest = ++latestRequest.current
        if (sales && Object.keys(sales).length) setSalesCache(sales)
        const cachedSales = getSalesCache()
        const mergedSales = { ...cachedSales, ...(sales || {}) }
        const filteredSales = Object.fromEntries(Object.entries(mergedSales).filter(([, v]) => v && typeof v === 'object' && ('kind' in v || 'price' in v)))
        const effectiveSales = Object.keys(filteredSales).length ? filteredSales : mergedSales
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

        apiReq('order/cart/product', {
            id: product.id,
            amount: newAmount,
            domainId: order?.domainId
        })
            .then(({ order: serverOrder, sales: returnedSales }) => {
                if (returnedSales) setSalesCache(returnedSales)
                if (currentRequest === latestRequest.current && serverOrder) setOrder(serverOrder)
            })
            .catch(() => { })
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
