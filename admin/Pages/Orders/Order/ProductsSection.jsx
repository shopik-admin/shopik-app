import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import CartList from 'common/components/CartList'
import { groupCart } from 'common/functions/cartReplacements'
import styles from './order.module.css'

export default function ProductsSection({ order }) {
    const entries = groupCart(order.cart || [])

    return <Card className={styles.productsCard}>
        <Flex gap={8} alignItems='center' className={styles.productsCardHeader}>
            <Text size='h3' bold className={styles.productsCardTitle}>{'products_in_order'}</Text>
            {/* A pair counts once: the customer ordered one product, and the line
              that supplied it is not a second one they ordered. */}
            <Text size='s' bold className={styles.countPill}>{entries.length}</Text>
        </Flex>
        <CartList entries={entries} admin />
    </Card>
}
