import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import ProductInline from 'common/components/ProductInline'
import styles from './order.module.css'

export default function ProductsSection({ order }) {
    const cart = order.cart || []

    return <Card className={styles.productsCard}>
        <Flex gap={8} alignItems='center' className={styles.productsCardHeader}>
            <Text size='h3' bold className={styles.productsCardTitle}>{'products_in_order'}</Text>
            <Text size='s' bold className={styles.countPill}>{cart.length}</Text>
        </Flex>
        <Flex col gap={10}>
            {cart.map(product => (
                <ProductInline
                    key={product.id || product.barcode}
                    product={product}
                    remove={false}
                    note={false}
                    admin
                />
            ))}
        </Flex>
    </Card>
}
