import { useOrder } from 'features/Order/OrderProvider'
import { useCart } from './CartProvider'
import Button from 'common/components/Button'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import classNames from 'common/functions/classNames'
import styles from './cart.module.css'
import ProductInline from './ProductInline'
import ConfirmButton from 'common/components/ConfirmButton'
import render from '#common/functions/render.js'
import apiReq from '#common/functions/apiReq.js'
import { useNavigate } from 'react-router'
import { useMemo } from 'react'
import { useAppData } from 'App'
import { calcShipping } from '#common/functions/shipping.js'

function getShippingConfigFromSettings(settings) {
    if (!settings || typeof settings !== 'object') return null
    if (settings.shipping && typeof settings.shipping === 'object' && ('total' in settings.shipping || 'freeFrom' in settings.shipping)) return settings.shipping
    for (const cat of Object.values(settings)) {
        if (cat && typeof cat === 'object' && cat.shipping && typeof cat.shipping === 'object') return cat.shipping
    }
    return null
}

export default function Cart({ }) {
    const
        { order = {}, setOrder } = useOrder(),
        cart = order?.cart || [],
        emptyCart = !cart.length,
        navigate = useNavigate()

    const { cartOpen, setCartOpen } = useCart()
    const { settings } = useAppData() || {}
    const shippingConfig = useMemo(() => getShippingConfigFromSettings(settings), [settings])

    const sum = order?.sum ?? 0
    const shipping = order?.shipping ?? calcShipping({ sum, deliveryMethod: order?.deliveryMethod, shippingConfig })
    const sumWithShipping = order?.sumWithShipping ?? (sum + Number(shipping || 0))
    const originalShipping = order?.deliveryMethod === 'pickup'
        ? Number(shippingConfig?.pickupTotal ?? shippingConfig?.total ?? 0)
        : Number(shippingConfig?.total ?? 0)
    const isFreeShipping = Number(shipping) === 0 && originalShipping > 0 && sum > 0
    const savings = (() => {
        const before = order?.sumNoCoupon ?? order?.sum ?? 0
        const after = order?.sum ?? 0
        return Math.max(0, before - after)
    })()

    function goToCheckout() {
        if (!emptyCart) {
            navigate('/checkout')
            setCartOpen(false)
        }
    }

    function clearCart() {
        if (emptyCart) return
        setOrder({
            ...order,
            cart: [],
            sales: {},
            sum: 0,
            sumNoCoupon: 0,
            finalSum: 0,
            finalSumNoCoupon: 0,
            shipping: 0,
            sumWithShipping: 0,
            finalShipping: 0,
            finalSumWithShipping: 0
        })
        apiReq('order/cart/clear', { domainId: order?.domainId })
            .then(({ order: serverOrder }) => {
                if (serverOrder) setOrder(serverOrder)
            })
            .catch(() => { })
    }

    return <Flex col className={classNames(styles.cart, [styles.open, cartOpen])}>
        <Flex className={styles.header} alignItems='center' justifyContent='space-between'>
            <Text size='xxl' bold>cart_title</Text>
            <Flex className={styles.actions} center gap={15}>
                <Button icon='coupon' mode='vertical'>coupons</Button>
                <Button icon='listPlus' mode='vertical'>save_list</Button>
                <ConfirmButton
                    icon='trash' mode='vertical'
                    disabled={emptyCart}
                    q='clear_cart_confirm'
                    onOk={clearCart}>
                    clear_cart
                </ConfirmButton>
            </Flex>
        </Flex>

        {emptyCart ?
            <Flex col gap={10} className={styles.emptyCart} center>
                <Text size='xxl' bold>empty_cart_title</Text>
                <Text >empty_cart_subtitle</Text>
                <Icon name='heartPlus' />
            </Flex>
            :
            <Flex col gap={10} className={styles.items} >
                {cart.map(item => <ProductInline key={item.id} product={item} />)}
            </Flex>
        }

        <Flex col className={styles.footer}>
            <Flex col gap={10} className={styles.summary}>
                <Flex alignItems='center' justifyContent='space-between'>
                    <Text mode='sub' bold>subtotal_text</Text>
                    <Text mode='sub' bold>{render({ type: 'coin', value: sum })}</Text>
                </Flex>
                <Flex alignItems='center' justifyContent='space-between'>
                    <Text mode='sub' bold>handling_and_delivery</Text>
                    {isFreeShipping ? (
                        <Flex gap={6} alignItems='center'>
                            <Text mode='sub' bold style={{ textDecoration: 'line-through', opacity: 0.6 }}>{render({ type: 'coin', value: originalShipping })}</Text>
                            <Text mode='sub' bold>free_shipping</Text>
                        </Flex>
                    ) : (
                        <Text mode='sub' bold>{render({ type: 'coin', value: shipping })}</Text>
                    )}
                </Flex>
                <Flex alignItems='center' justifyContent='space-between'>
                    <Text size='l' bold>total_saved_in_purchase</Text>
                    <Text size='l' bold>{render({ type: 'coin', value: savings })}</Text>
                </Flex>
            </Flex>
            <Button icon='cart' onClick={goToCheckout}>
                <Text>to_pay</Text>
                <Text>{render({ type: 'coin', value: sumWithShipping })}</Text>
            </Button>
        </Flex>
    </Flex >
}
