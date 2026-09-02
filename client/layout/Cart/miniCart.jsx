import { useState, useMemo } from 'react'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import { useText } from 'common/texts/TextProvider'
import classNames from 'common/functions/classNames'
import { useCart } from './CartProvider'
import { useOrder } from 'features/Order/OrderProvider'
import { useAppData } from 'App'
import { calcShipping, getRemainingToFreeShipping } from '#common/functions/shipping.js'
import styles from './cart.module.css'

function getShippingConfigFromSettings(settings) {
    if (!settings || typeof settings !== 'object') return null
    if (settings.shipping && typeof settings.shipping === 'object' && ('total' in settings.shipping || 'freeFrom' in settings.shipping)) return settings.shipping
    for (const cat of Object.values(settings)) {
        if (cat && typeof cat === 'object' && cat.shipping && typeof cat.shipping === 'object') return cat.shipping
    }
    return null
}

export default function MiniCart({
    isOpen: controlledIsOpen,
    onToggle,
    freeShippingThreshold,
    className
}) {
    const [internalIsOpen, setInternalIsOpen] = useState(false)
    const { cartOpen: ctxCartOpen, toggleCart: ctxToggleCart } = useCart?.() || {}


    const isOpen = controlledIsOpen !== undefined
        ? controlledIsOpen
        : (ctxCartOpen !== undefined ? ctxCartOpen : internalIsOpen)
    const { TR } = useText?.() || {}
    const { order } = useOrder()
    const { settings } = useAppData() || {}
    const shippingConfig = useMemo(() => getShippingConfigFromSettings(settings), [settings])
    // sum pre-coupon per spec, pay amount is sumWithShipping
    const sum = order?.sum ?? 0
    const total = order?.sumWithShipping ?? (order?.shipping != null ? (sum + Number(order.shipping || 0)) : sum)
    const itemCount = order?.cart?.length

    const handleToggle = (e) => {
        if (onToggle) {
            onToggle(e)
        } else if (controlledIsOpen === undefined) {
            if (ctxToggleCart) {
                ctxToggleCart()
            } else {
                setInternalIsOpen((prev) => !prev)
            }
        }
    }

    const isCartEmpty = !itemCount || itemCount === 0
    const formattedTotal = Number(total || 0).toLocaleString('he-IL', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    })

    const effectiveThreshold = freeShippingThreshold ?? (order?.deliveryMethod === 'pickup'
        ? (shippingConfig?.pickupFreeFrom ?? shippingConfig?.freeFrom)
        : (shippingConfig?.freeFrom))
    const remaining = effectiveThreshold != null
        ? getRemainingToFreeShipping({ sum, deliveryMethod: order?.deliveryMethod, shippingConfig })
        : Math.round(Math.max(0, (freeShippingThreshold ?? 0) - sum))

    // DRY Translations from hebrew.json
    const toPayText = TR?.('to_pay')
    const currencySymbol = TR?.('currency_symbol')
    const subtext = isCartEmpty
        ? (TR?.('cart_empty_subtext')) :
        remaining ?
            (TR?.('free_shipping_subtext')).replace('{remaining}', remaining) : TR?.('free_shipping') || 'free_shipping'

    // Shared Cart Icon with Badge element
    const cartIconElement = (
        <div className={styles.cartIconWrapper}>
            <Icon
                name="cart"
                className={classNames(styles.cartIcon, [styles.cartIconOpen, isOpen])}
            />
            {!isCartEmpty && <span className={styles.badge}>{itemCount}</span>}
        </div>
    )

    return (
        <Button
            className={classNames(styles.miniCartButton, className)}
            onClick={handleToggle}
            aria-label="mini cart"
        >
            {/* Cart Icon + Badge */}
            <div className={styles.cartIconSlot}>
                {cartIconElement}
            </div>

            {/* Desktop View Text Content */}
            <Flex col className={styles.desktopContent} gap={2} alignItems="start">
                <Text size='s' className={styles.mainText}>
                    {toPayText} {formattedTotal} {currencySymbol}
                </Text>
                <Text size='xs' className={styles.subText}>
                    {subtext}
                </Text>
            </Flex>

            {/* Tablet & Mobile Price Label */}
            <Text className={styles.compactPrice}>
                {formattedTotal} {currencySymbol}
            </Text>

            {/* Chevron Arrow */}
            <Icon
                name="down"
                className={classNames(styles.chevronIcon, [styles.chevronOpen, isOpen])}
            />
        </Button>
    )
}