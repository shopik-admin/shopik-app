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
    return <Image
        className={classNames(styles.productImage, styles[size])}
        src='https://www.sweetshop.co.il/wp-content/uploads/2022/02/6901353_7290000068787_L_1_Enlarge.jpeg' />
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
    return <Flex className={classNames(styles.badges, styles[size])}>
        {!!product.badges && product.badges.map(badge => (
            <Text key={badge}>{badge}</Text>
        ))}
    </Flex>
}

function ProductPrice({ product, size = 'm' }) {
    try {
        const price = product.prices[0].price
        return <Flex gap={20} alignItems='center' className={classNames(styles.price, styles[size])}>
            <Text size='xxl' bold><Text size='s' bold>₪</Text>{price}</Text>
            <Text size='s' mode='sub' className={styles.forgrams}>{getUnitPriceText(product)}</Text>
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