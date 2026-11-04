import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import ProductInline from 'common/components/ProductInline'
import ReplacementCard from 'common/components/ReplacementCard'
import { groupCart } from 'common/functions/cartReplacements'
import styles from './order.module.css'

export default function ProductsSection({ order }) {
    // A replaced product and the line that supplied its order are one entry here —
    // the same pair card the picking screen shows, so this page does not read as
    // "something was missing" plus "the customer ordered the replacement".
    const entries = groupCart(order.cart || [])

    return <Card className={styles.productsCard}>
        <Flex gap={8} alignItems='center' className={styles.productsCardHeader}>
            <Text size='h3' bold className={styles.productsCardTitle}>{'products_in_order'}</Text>
            <Text size='s' bold className={styles.countPill}>{entries.length}</Text>
        </Flex>
        <Flex col gap={10}>
            {entries.map(entry => entry.type === 'pair'
                ? <ReplacementCard key={entry.key} original={entry.original} replacer={entry.replacer} />
                : <ProductInline key={entry.key} product={entry.product} remove={false} note={false} admin />
            )}
        </Flex>
    </Card>
}
