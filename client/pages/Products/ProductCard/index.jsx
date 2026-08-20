import styles from './productCard.module.css'
import Button from 'common/components/Button'
import Image from 'common/components/Image'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import { Link } from 'react-router'
import classNames from 'common/functions/classNames'

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
    const { images } = product || {}
    const mainImage = images?.product?.find(i => i.main === true) || images?.[0] || null
    const src = mainImage?.sizes[size] || ''

    return <Image
        className={classNames(styles.productImage, styles[size])}
        src={src} alt={product.name} />
}

export function ProductInfo(props) {
    const { product, size = 'm' } = props
    return <Flex col className={classNames(styles.info, styles[size])}>
        <ProductPrice {...props} />
        <Text bold>{product.name}</Text>
    </Flex>
}

export function ProductButton({ product, size = 'm' }) {
    return <Flex className={classNames(styles.actions, styles[size])}>
        <Button
            icon='add' preventDefault stopPropagation
            onClick={console.log}
        >add_to_cart</Button>
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
        const price = product.prices[0].price
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