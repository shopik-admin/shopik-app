import { useOrder } from 'features/Order/OrderProvider'
import Button from 'common/components/Button'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import styles from './cart.module.css'
import { createContext, useContext } from 'react'

export const CartContext = createContext({})
export const useCart = () => useContext(CartContext)

export default function Cart({ }) {
    const
        { order = {} } = useOrder(),
        cart = order?.cart || [],
        emptyCart = !cart.length

    return <Flex col className={styles.cart}>
        <Flex className={styles.header} alignItems='center' justifyContent='space-between'>
            <Text size='xxl' bold>cart_title</Text>
            <Flex className={styles.actions} center gap={15}>
                <Button icon='coupon' mode='vertical'>coupons</Button>
                <Button icon='listPlus' mode='vertical'>save_list</Button>
                <Button icon='trash' mode='vertical'>clear_cart</Button>
            </Flex>
        </Flex>

        {emptyCart ?
            <Flex col gap={10} className={styles.emptyCart} grow={1} center>
                <Text size='xxl' bold>empty_cart_title</Text>
                <Text >empty_cart_subtitle</Text>
                <Icon name='heartPlus' />
            </Flex>
            :
            <Flex col className={styles.items} grow={1}>
                {cart.map(item => <Text>{item.name} - {item.amount}</Text>)}
            </Flex>}

        <Flex col className={styles.footer}>
            <Text>{order?.sum}</Text>
            <Button icon='cart'>to_pay</Button>
        </Flex>
    </Flex >
}
