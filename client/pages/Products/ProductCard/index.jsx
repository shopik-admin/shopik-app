import styles from './productCard.module.css'
import Button from 'common/components/Button'
import Image from 'common/components/Image'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import { Link } from 'react-router'
import classNames from 'common/functions/classNames'
import calcOrder from '#common/functions/calcOrder/cart.js'
import apiReq from '#common/functions/apiReq.js'
import { useOrder } from 'features/Order/OrderProvider'
import { useRef } from 'react'

export default function ProductCard(props) {
    const { product, ...rest } = props
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

export function ProductImage({ product, size = 'm' }) {
    return <Image
        className={classNames(styles.productImage, styles[size])}
        src='https://www.sweetshop.co.il/wp-content/uploads/2022/02/6901353_7290000068787_L_1_Enlarge.jpeg' />
}

export function ProductInfo(props) {
    const { product, size = 'm' } = props
    return <Flex gap={4} col className={classNames(styles.info, styles[size])}>
        <ProductPrice {...props} />
        <Text size='xs' mode='sub'>אסם | 200 גרם</Text>
        <Text bold>{product.name}</Text>
    </Flex>
}

export function ProductButton({ product, size = 'm', sales }) {
    const { order, setOrder } = useOrder()
    const latestRequest = useRef(0)
    const amount = order?.cart?.find(item => item.id === product.id)?.amount || 0

    const updateAmount = (newAmount) => {
        const currentRequest = ++latestRequest.current

        const optimisticOrder = calcOrder({
            order: order || {},
            product,
            amount: newAmount,
            sales: sales || {}
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

    if (!amount) {
        return <Flex className={classNames(styles.productButton, styles[size])} >
            <Button
                icon='add' preventDefault stopPropagation
                onClick={() => updateAmount(1)}
            >add_to_cart</Button>
        </Flex >
    }

    return <Flex className={classNames(styles.productButton, styles[size], styles.stepper)}>
        <Button icon='add' preventDefault stopPropagation onClick={() => updateAmount(amount + 1)} />
        <Text size='m' bold className={styles.amount}>{amount}</Text>
        <Button preventDefault stopPropagation onClick={() => updateAmount(amount - 1)}>-</Button>
    </Flex>
}

export function ProductBadges({ product, size = 'm' }) {
    if (!product.badges) return null
    return <Flex className={classNames(styles.badges, styles[size])}>
        {product.badges.map(badge => (
            <Text key={badge}>{badge}</Text>
        ))}
    </Flex>
}

export function ProductPrice({ product, size = 'm' }) {
    try {
        const price = product.price || product.prices[0].price
        const unitPriceText = getUnitPriceText(product)
        return <Flex gap={20} alignItems='center' className={classNames(styles.price, styles[size])}>
            <Text size='xxl' bold><Text size='s' bold>₪</Text>{price}</Text>
            {unitPriceText && <Text size='s' mode='sub' className={styles.forgrams}>{unitPriceText}</Text>}
        </Flex>

    } catch (error) {
        return null
    }
}

export function getUnitPriceText({ unitType, unitBase, unitAmount }) {
    if (unitType === 'weight' && unitBase === 'g' && unitAmount) {
        return `${(unitAmount * 100).toFixed(0)}ג ל-100ג`
    }
    if (unitType === 'weight' && unitBase === 'kg' && unitAmount) {
        return `${(unitAmount * 100).toFixed(0)}ג ל-100ג`
    }
    if (unitType === 'pack' && unitAmount) {
        return `x${unitAmount}`
    }
    return ''
}