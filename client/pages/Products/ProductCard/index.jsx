import styles from './productCard.module.css'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import { Link } from 'react-router'
import calcOrder from 'common/functions/calcOrder/cart.js'
import { useOrder } from 'features/Order/OrderProvider'
import { useAppData } from 'App'
import { useUser } from 'features/User'
import { useMemo } from 'react'
import { extractShippingConfig } from '#common/functions/shipping.js'
import {
    ProductImage,
    ProductInfo,
    ProductPrice,
    ProductBadges,
    getUnitPriceText,
    ProductButton as CommonProductButton
} from 'common/components/Product'
import { getSalesCache, setSalesCache } from '#common/functions/salesCache.js'

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
    const { order, setOrder, queueCartSync } = useOrder()
    const { settings } = useAppData() || {}
    const shippingConfig = useMemo(() => extractShippingConfig(settings), [settings])
    const user = useUser()
    const amount = order?.cart?.find(item => item.id === product.id)?.amount || 0

    const updateAmount = (newAmount) => {
        if (sales && Object.keys(sales).length) setSalesCache(sales)
        const cachedSales = getSalesCache()
        // Check if we have all needed saleIds for optimistic calc
        const neededIds = [...new Set([...(order?.cart || []).flatMap(i => i.saleIds || []), ...(product.saleIds || [])])]
        const missing = neededIds.filter(id => !cachedSales[id])
        if (!missing.length) {
            console.log({ sales, product, newAmount })
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

    return <CommonProductButton product={product} size={size} sales={sales} amount={amount} onUpdateAmount={updateAmount} />
}