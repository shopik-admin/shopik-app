import CommonProductInline from 'common/components/ProductInline'
import { useOrder } from 'features/Order/OrderProvider'
import calcOrder from 'common/functions/calcOrder/cart.js'
import apiReq from 'common/functions/apiReq.js'
import { useRef } from 'react'

export default function ProductInline({ remove = true, note = true, product, sales, ...props }) {
    const { order = {}, setOrder } = useOrder()
    const latestRequest = useRef(0)
    const amount = order?.cart?.find(item => item.id === product?.id)?.amount ?? product?.amount ?? 0

    function handleRemove() {
        if (product) {
            const updatedOrder = calcOrder({
                order,
                product,
                amount: 0
            })
            setOrder(updatedOrder)
            // keep server in sync for removal
            apiReq('order/cart/product', {
                id: product.id,
                amount: 0,
                domainId: order?.domainId
            }).catch(() => { })
        }
    }

    function handleUpdateAmount(newAmount) {
        const currentRequest = ++latestRequest.current
        const optimisticOrder = calcOrder({
            order: order || {},
            product,
            amount: newAmount,
            sales: { ...order?.sales, ...sales }
        })
        setOrder(optimisticOrder)

        apiReq('order/cart/product', {
            id: product.id,
            amount: newAmount,
            domainId: order?.domainId
        })
            .then(({ order: serverOrder }) => {
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
