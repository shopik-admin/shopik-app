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

export default function Cart({ }) {
    const
        { order = {}, setOrder } = useOrder(),
        cart = order?.cart || [],
        emptyCart = !cart.length,
        navigate = useNavigate()

    const { cartOpen, setCartOpen } = useCart()

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
            finalSumNoCoupon: 0
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
                {cart.map(item => <ProductInline product={item} />)}
            </Flex>
        }

        <Flex col className={styles.footer}>
            <Flex col gap={10} className={styles.summary}>
                <Flex alignItems='center' justifyContent='space-between'>
                    <Text mode='sub' bold>סכום ביניים</Text>
                    <Text mode='sub' bold>{render({ type: 'coin', value: order?.sum })}</Text>
                </Flex>
                <Flex alignItems='center' justifyContent='space-between'>
                    <Text mode='sub' bold>דמי טיפול ומשלוח</Text>
                    <Text mode='sub' bold>{render({ type: 'coin', value: order?.sum })}</Text>
                </Flex>
                <Flex alignItems='center' justifyContent='space-between'>
                    <Text size='l' bold>סה"כ חסכת בקניה זו</Text>
                    <Text size='l' bold>{render({ type: 'coin', value: order?.sum })}</Text>
                </Flex>
            </Flex>
            <Button icon='cart' onClick={goToCheckout}>
                <Text>to_pay</Text>
                <Text>{render({ type: 'coin', value: order?.sum })}</Text>
            </Button>
        </Flex>
    </Flex >
}
