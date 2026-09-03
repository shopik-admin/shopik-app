import styles from './productCard.module.css'
import Flex from 'common/components/Flex'
import { Link } from 'react-router'
import {
    ProductImage,
    ProductInfo,
    ProductPrice,
    ProductBadges,
    getUnitPriceText,
    ProductButton as CommonProductButton
} from 'common/components/Product'
import { useProductCart } from 'common/components/Product/useProductCart.js'

// Re-export common presentational helpers for backward compatibility
export { ProductImage, ProductInfo, ProductPrice, ProductBadges, getUnitPriceText }

export default function ProductCard(props) {
    const { product } = props
    return <Flex
        tag={Link}
        to={`/product/${product.id}`}
        state={{ product }}
        col gap={10} justifyContent='space-between'
        className={styles.productCard}>
        <ProductImage {...props} />
        <ProductInfo {...props} />
        <ProductBadges {...props} />
        <ProductButton {...props} />
    </Flex>
}

export function ProductButton({ product, size = 'm', sales = {} }) {
    const { amount, updateAmount } = useProductCart(product, sales)
    return <CommonProductButton product={product} size={size} sales={sales} amount={amount} onUpdateAmount={updateAmount} />
}