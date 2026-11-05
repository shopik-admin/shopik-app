import styles from './productCard.module.css'
import Flex from 'common/components/Flex'
import { Link } from 'react-router'
import {
    ProductImage,
    ProductInfo,
    ProductPrice,
    ProductButton as CommonProductButton,
    ProductFavorite,
    ProductStamps,
    getFirstSale,
    getSaleProgressText,
    getUnitPriceText
} from 'common/components/Product'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import { useProductCart } from 'common/components/Product/useProductCart.js'
import { useUser } from 'features/User'
import { getProductState } from '#common/functions/productState.js'

// Re-export common presentational helpers for backward compatibility
export { ProductImage, ProductInfo, ProductPrice, getUnitPriceText }

export default function ProductCard(props) {
    const { product, sales = {}, size = 'm' } = props
    const { amount, updateAmount, productMaxAmount, saleTotalAmount } = useProductCart(product, sales)
    const sale = getFirstSale(product, sales)
    const { action, price } = getProductState({ amount, sale })
    const saleProgressText = getSaleProgressText(sale, saleTotalAmount)
    const { isFavorite, toggleFavorite } = useUser() || {}

    return <Flex
        tag={Link}
        to={`/product/${product.id}`}
        state={{ product }}
        col justifyContent='space-between'
        data-action={action}
        data-price={price}
        className={styles.productCard}>
        {saleProgressText && <Flex alignItems='center' justifyContent='center' gap={6} className={styles.saleBar}>
            <Icon name='salePercent' size={16} className={styles.saleBarIcon} />
            <Text size='s' bold className={styles.saleBarText}>{saleProgressText}</Text>
        </Flex>}
        <Flex col gap={10} justifyContent='space-between' className={styles.cardContent}>
            <ProductFavorite
                on={isFavorite?.(product.id)}
                onToggle={() => toggleFavorite?.(product.id)}
            />
            <ProductImage {...props} />
            <ProductInfo {...props} nameLines={2} />
            <ProductStamps product={product} className={styles.stamps} />
            <CommonProductButton
                product={product}
                sales={sales}
                size={size}
                amount={amount}
                onUpdateAmount={updateAmount}
                maxAmount={productMaxAmount}
            />
        </Flex>
    </Flex>
}

// Standalone cart-wired button for consumers outside the card shell
// (e.g. the related-products rail on the product page).
export function ProductButton({ product, sales = {} }) {
    const { amount, updateAmount, productMaxAmount } = useProductCart(product, sales)
    return <CommonProductButton product={product} sales={sales} amount={amount} onUpdateAmount={updateAmount} maxAmount={productMaxAmount} />
}