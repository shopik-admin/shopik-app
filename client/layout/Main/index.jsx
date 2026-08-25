import styles from './main.module.css'
import Flex from 'common/components/Flex'
import classNames from 'common/functions/classNames'
import { useCart } from 'layout/Cart/CartProvider'

export default function Main({ children }) {
    const { cartOpen } = useCart()
    return <Flex gap={20} tag='main' className={classNames(styles.main, [styles.shifted, cartOpen])}>
        {children}
    </Flex>
}
