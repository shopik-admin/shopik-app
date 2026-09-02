import styles from './productCard.module.css'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import { Link } from 'react-router'
import calcOrder from 'common/functions/calcOrder/cart.js'
import apiReq from 'common/functions/apiReq.js'
import { useOrder } from 'features/Order/OrderProvider'
import { useRef } from 'react'
import {
    ProductImage,
    ProductInfo,
    ProductPrice,
    ProductBadges,
    getUnitPriceText,
    ProductButton as CommonProductButton
} from 'common/components/Product'

// Re-export common presentational helpers for backward compatibility
export { ProductImage, ProductInfo, ProductPrice, ProductBadges, getUnitPriceText }

export default function ProductCard(props) {
    const { product } = props
    return <Flex
        tag={Link}
        to={`/product/${product.id}`}
        state={{ product }}
        col gap={10} justifyContent='space-between'
        className={styles.productCard}>
        <ProductImage {...props} />
        <ProductInfo {...props} />
        <ProductBadges {...props} />
        <ProductButton {...props} />
    </Flex>
}

export function ProductButton({ product, size = 'm', sales = {} }) {
    const { order, setOrder } = useOrder()
    const latestRequest = useRef(0)
    const amount = order?.cart?.find(item => item.id === product.id)?.amount || 0

    const updateAmount = (newAmount) => {
        const currentRequest = ++latestRequest.current
        console.log({ sales, product, newAmount })
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
            .then(({ order }) => {
                if (currentRequest === latestRequest.current && order) setOrder(order)
            })
            .catch(() => { })
    }

    return <CommonProductButton product={product} size={size} sales={sales} amount={amount} onUpdateAmount={updateAmount} />
}