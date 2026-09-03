import styles from './product.module.css'
import Button from 'common/components/Button'
import Image from 'common/components/Image'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import classNames from 'common/functions/classNames'
import { round3 } from 'common/functions/calcOrder/utils.js'
import { getProductImageUrl } from 'common/functions/productImageUrl.js'
import { useState, useEffect } from 'react'
import { getSalesCache } from '#common/functions/salesCache.js'

export function getFirstSale(product, sales) {
    const saleId = product?.saleIds?.[0]
    if (!saleId) return null
    if (sales && sales[saleId]) return sales[saleId]
    try {
        const cache = getSalesCache?.()
        if (cache && cache[saleId]) return cache[saleId]
    } catch { }
    return null
}

export function getSaleBadgeText(sale) {
    if (!sale) return null
    // fallback: generate from kind/amount/price/percent
    console.log('getSaleBadgeText', sale)
    const amount = sale.amount
    const price = sale.price
    const percent = sale.percent
    if (sale.kind === 'price' && amount > 1 && price != null) return `מבצע ${amount} ב-${price}`
    if (sale.kind === 'price' && price != null) return `מבצע ב-${price}`
    if (sale.kind === 'percent' && percent != null) return `מבצע ${percent}% הנחה`
    if (amount > 1 && price != null) return `מבצע ${amount} ב-${price}`
    if (percent != null) return `מבצע ${percent}%`
    return 'מבצע'
}

export function ProductSaleBadge({ product, sales, size = 'm' }) {
    const sale = getFirstSale(product, sales)
    if (!sale) return null
    const label = getSaleBadgeText(sale)
    return <Flex alignItems="center" gap={4} className={classNames(styles.saleBadge, styles[size])}>
        <Icon name="salePercent" size={12} className={styles.saleBadgeIcon} />
        <Text size="xs" bold className={styles.saleBadgeText}>{label}</Text>
    </Flex>
}

export function ProductImage({ product, size = 'm', sales }) {
    const [failed, setFailed] = useState(false)
    useEffect(() => { setFailed(false) }, [product?.id, size])
    const src = product?.id ? getProductImageUrl(product.id, size) : ''
    const saleBadge = <ProductSaleBadge product={product} sales={sales} size={size} />
    if (failed || !src) {
        return <div className={classNames(styles.productImageWrapper, styles[size])}>
            <Flex
                center
                className={classNames(styles.productImage, styles[size], styles.productImageFallback)}
            >
                <Icon name="image" size={32} style={{ opacity: 0.35 }} />
            </Flex>
            {saleBadge}
        </div>
    }

    return <div className={classNames(styles.productImageWrapper, styles[size])}>
        <Image
            className={classNames(styles.productImage, styles[size])}
            src={src} alt={product.name} loading="eager" onError={() => setFailed(true)} />
        {saleBadge}
    </div>
}

export function isWeightProduct(product) {
    const t = product?.unit?.type
    return t === 'weight' || t === 'WEIGHT'
}

export function getUnitLabel(product) {
    const unit = product?.unit || {}
    const type = unit.type
    const base = unit.baseUnit
    if (type === 'weight') {
        if (base === 'kg') return 'ק"ג'
        if (base === 'g') return 'גרם'
        return 'ק"ג'
    }
    if (base === 'kg') return 'ק"ג'
    if (base === 'g') return 'גרם'
    return "יח'"
}

export function formatAmount(product, amount) {
    if (amount == null || amount === '') return ''
    const n = Number(amount)
    if (isNaN(n)) return `${amount} ${getUnitLabel(product)}`
    const str = Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000)
    return `${str} ${getUnitLabel(product)}`
}

export function getUnitInfoText(product) {
    if (!product) return ''
    const label = product.label || product.producer || ''
    const unit = product.unit
    let unitText = ''
    if (unit?.type === 'weight') {
        if (unit.baseUnit === 'kg') unitText = unit.amount ? `${unit.amount} ק"ג` : 'משקל'
        else if (unit.baseUnit === 'g') unitText = unit.amount ? `${unit.amount} גרם` : 'משקל'
        else unitText = 'משקל'
    } else if (unit?.type === 'pack' || unit?.type === 'item') {
        unitText = unit.amount ? `${unit.amount} יח'` : ''
    } else {
        // fallback to legacy fields
        if (product.unitType || product.unitAmount) {
            return getUnitPriceText(product) || ''
        }
    }
    // also handle cart unit with option
    if (unit?.option?.name) return unit.option.name
    if (unit?.option?.amount) {
        const base = unit.baseUnit === 'kg' ? 'ק"ג' : unit.baseUnit === 'g' ? 'גרם' : "יח'"
        return `${unit.option.amount} ${base}`
    }
    if (label && unitText) return `${label} | ${unitText}`
    if (label) return label
    if (unitText) return unitText
    return label || '200 גרם'
}

export function ProductInfo(props) {
    const { product, sales, size = 'm' } = props
    const infoText = getUnitInfoText(product)
    return <Flex gap={4} col className={classNames(styles.info, styles[size])}>
        <ProductPrice {...props} />
        {infoText && <Text size='xs' mode='sub'>{infoText}</Text>}
        <Text bold>{product.name}</Text>
    </Flex>
}

export function ProductButton({ product, amount = 0, onUpdateAmount, size = 'm', sales = {} }) {
    // For weight, show amount with unit label (e.g. "1.5 ק\"ג"); for items show "2 יח'"
    // Presentational stepper — caller provides amount and update handler
    // If no handler provided, button is disabled / hidden
    const minAmount = product?.unit?.minAmount || 1
    const step = product?.unit?.step || 1

    if (!amount) {
        return <Flex className={classNames(styles.productButton, styles[size])} >
            <Button
                icon='add' preventDefault stopPropagation
                onClick={() => onUpdateAmount?.(round3(minAmount) || 1)}
                disabled={!onUpdateAmount}
            >add_to_cart</Button>
        </Flex >
    }

    const displayAmount = formatAmount(product, amount)
    const handleInc = () => onUpdateAmount?.(round3(amount + step))
    const handleDec = () => {
        const next = round3(amount - step)
        onUpdateAmount?.(next <= 0 ? 0 : next)
    }

    return <Flex
        onClick={e => {
            e.preventDefault()
            e.stopPropagation()
        }}
        className={classNames(styles.productButton, styles[size], styles.stepper)}>
        <Button icon='add' preventDefault stopPropagation onClick={handleInc} disabled={!onUpdateAmount} />
        <Text size='m' bold className={styles.amount}>{displayAmount}</Text>
        <Button preventDefault stopPropagation onClick={handleDec} disabled={!onUpdateAmount}>-</Button>
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
