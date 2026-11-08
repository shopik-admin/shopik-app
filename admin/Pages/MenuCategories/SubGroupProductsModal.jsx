import useApi from 'common/functions/useApi'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import { ProductImage } from 'common/components/Product'
import styles from './menuCategories.module.css'

/**
 * Preview of the ACTIVE products a sub-group mapping covers (the API leaves
 * hidden/archived products out, so this is exactly what the mapping buys).
 *
 * Layout is the requested one: image on the right, name beside it, barcode
 * under the name. In the RTL flow the first child is the rightmost, so the
 * image comes first.
 */
export default function SubGroupProductsModal({ entry, onClose }) {
    const { data, loading, error } = useApi('category/products', { subGroupCode: entry.code })
    const products = data?.products || []
    const total = data?.total ?? 0

    return <div className={styles.productsModal}>
        <Flex justifyContent='space-between' alignItems='center' gap={10} className={styles.productsHead}>
            <Text size='s' mode='sub'>
                {data
                    ? `${total} מוצרים פעילים${total > products.length ? ` (מציג ${products.length})` : ''}`
                    : 'טוענים מוצרים...'}
            </Text>
            <Button mode='text' icon='x' onClick={onClose}>סגירה</Button>
        </Flex>

        {error && <Text mode='error'>{error?.message || String(error)}</Text>}
        {!error && loading && !products.length && <Text mode='sub'>טוענים מוצרים...</Text>}
        {!error && !loading && !products.length && <Text mode='sub'>אין מוצרים פעילים בתת קבוצה זו.</Text>}

        {products.length > 0 && <div className={styles.productGrid}>
            {products.map(product => <Card key={product.id} className={styles.productCard}>
                <ProductImage product={product} size='s' hideSaleBadge />
                <div className={styles.productText}>
                    <Text bold size='m'>{product.name}</Text>
                    <Text size='s' mode='sub' className={styles.productBarcode}>
                        {product.barcode || 'ללא ברקוד'}
                        <Icon name='barcode' size={12} />
                    </Text>
                </div>
            </Card>)}
        </div>}
    </div>
}
