import styles from './product.module.css'
import Button from 'common/components/Button'
import Image from 'common/components/Image'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import classNames from 'common/functions/classNames'

export function ProductImage({ product, size = 'm' }) {
    const { images } = product || {}
    const mainImage = images?.product?.find(i => i.main === true) || images?.[0] || null
    const src = mainImage?.sizes[size] || ''

    return <Image
        className={classNames(styles.productImage, styles[size])}
        src={src} alt={product.name} />
}

export function ProductInfo(props) {
    const { product, sales, size = 'm' } = props
    return <Flex gap={4} col className={classNames(styles.info, styles[size])}>
        <ProductPrice {...props} />
        <Text size='xs' mode='sub'>אסם | 200 גרם</Text>
        <Text bold>{product.name}</Text>
    </Flex>
}

export function ProductButton({ product, amount = 0, onUpdateAmount, size = 'm', sales = {} }) {
    // Presentational stepper — caller provides amount and update handler
    // If no handler provided, button is disabled / hidden
    if (!amount) {
        return <Flex className={classNames(styles.productButton, styles[size])} >
            <Button
                icon='add' preventDefault stopPropagation
                onClick={() => onUpdateAmount?.(1)}
                disabled={!onUpdateAmount}
            >add_to_cart</Button>
        </Flex >
    }

    return <Flex className={classNames(styles.productButton, styles[size], styles.stepper)}>
        <Button icon='add' preventDefault stopPropagation onClick={() => onUpdateAmount?.(amount + 1)} disabled={!onUpdateAmount} />
        <Text size='m' bold className={styles.amount}>{amount}</Text>
        <Button preventDefault stopPropagation onClick={() => onUpdateAmount?.(amount - 1)} disabled={!onUpdateAmount}>-</Button>
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
        const price = product.price || product.prices?.[0]?.price
        if (price == null) return null
        const unitPriceText = getUnitPriceText(product)
        return <Flex gap={20} alignItems='center' className={classNames(styles.price, styles[size])}>
            <Text size='xxl' bold><Text size='s' bold>₪</Text>{price}</Text>
            {unitPriceText && <Text size='s' mode='sub' className={styles.forgrams}>{unitPriceText}</Text>}
        </Flex>

    } catch (error) {
        return null
    }
}

export function getUnitPriceText({ unitType, unitBase, unitAmount, unit }) {
    // support both product.unit and flat unitType/unitBase/unitAmount
    const type = unitType || unit?.type
    const base = unitBase || unit?.baseUnit
    const amount = unitAmount || unit?.amount || unit?.units
    if (type === 'weight' && base === 'g' && amount) {
        return `${(amount * 100).toFixed(0)}ג ל-100ג`
    }
    if (type === 'weight' && base === 'kg' && amount) {
        return `${(amount * 100).toFixed(0)}ג ל-100ג`
    }
    if (type === 'pack' && amount) {
        return `x${amount}`
    }
    return ''
}
