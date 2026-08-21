import { useState } from 'react'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import { useText } from 'common/texts/TextProvider'
import classNames from 'common/functions/classNames'
import { useCart } from './CartProvider'
import styles from './cart.module.css'

/**
 * MiniCart Component
 * 
 * Supports RTL / LTR layouts via CSS logical properties and common components.
 * Consumes translations from `common/texts/hebrew.json` via `useText`.
 * 
 * @param {Object} props
 * @param {boolean} [props.isOpen] - Open/close state (controlled)
 * @param {Function} [props.onToggle] - Callback function when mini cart is clicked
 * @param {number} [props.total=250.3] - Total cart amount
 * @param {number} [props.itemCount=33] - Total item count in cart
 * @param {number} [props.freeShippingThreshold=506.3] - Free shipping target amount
 * @param {string} [props.className] - Additional CSS class names
 */
export default function MiniCart({
    isOpen: controlledIsOpen,
    onToggle,
    total = 250.3,
    itemCount = 33,
    freeShippingThreshold = 506.3,
    className
}) {
    const [internalIsOpen, setInternalIsOpen] = useState(false)
    const { cartOpen: ctxCartOpen, toggleCart: ctxToggleCart } = useCart?.() || {}
    const isOpen = controlledIsOpen !== undefined
        ? controlledIsOpen
        : (ctxCartOpen !== undefined ? ctxCartOpen : internalIsOpen)
    const { TR } = useText?.() || {}

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

    const remaining = Math.round(Math.max(0, freeShippingThreshold - total))

    // DRY Translations from hebrew.json
    const toPayText = TR?.('to_pay') || 'לתשלום'
    const currencySymbol = TR?.('currency_symbol') || '₪'
    const subtext = isCartEmpty
        ? (TR?.('cart_empty_subtext') || 'זה הזמן להוסיף את המוצר הראשון')
        : (TR?.('free_shipping_subtext') || 'עוד {remaining} ש״ח למשלוח חינם').replace('{remaining}', remaining)

    // DRY shared Cart Icon with Badge element
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
            {/* Cart Icon + Badge (Desktop: Start side, Tablet/Mobile: Stacked) */}
            <div className={styles.cartIconSlot}>
                {cartIconElement}
            </div>

            {/* Desktop View Text Content (Center) */}
            <Flex col className={styles.desktopContent} gap={2} alignItems="start">
                <Text size='s' className={styles.mainText}>
                    {toPayText}: {formattedTotal} {currencySymbol}
                </Text>
                <Text size='xs' className={styles.subText}>
                    {subtext}
                </Text>
            </Flex>

            {/* Tablet & Mobile Price Label (Center / Bottom) */}
            <Text className={styles.compactPrice}>
                {formattedTotal} {currencySymbol}
            </Text>

            {/* Chevron Arrow (Desktop & Tablet: End side) */}
            <Icon
                name="down"
                className={classNames(styles.chevronIcon, [styles.chevronOpen, isOpen])}
            />
        </Button>
    )
}