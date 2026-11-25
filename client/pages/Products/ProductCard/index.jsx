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
    getSaleLimitBarText,
    isSaleLimitExceeded,
    getUnitPriceText
} from 'common/components/Product'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import classNames from 'common/functions/classNames'
import { useProductCart } from 'common/components/Product/useProductCart.js'
import { useProductModalLink } from 'layout/ProductOverlay/useProductModalLink.js'
import { useUser } from 'features/User'
import { getProductState } from '#common/functions/productState.js'

// Re-export common presentational helpers for backward compatibility
export { ProductImage, ProductInfo, ProductPrice, getUnitPriceText }

export default function ProductCard(props) {
    const { product, sales = {}, size = 'm' } = props
    const { amount, updateAmount, productMaxAmount, saleTotalAmount } = useProductCart(product, sales)
    const sale = getFirstSale(product, sales)
    const { action, price } = getProductState({ amount, sale })
    // The cap is sale-wide: the cart engine pools the limit across every line
    // of the sale, so the warning counts what the whole cart holds.
    const limitExceeded = isSaleLimitExceeded(sale, saleTotalAmount)
    const saleBarText = limitExceeded
        ? getSaleLimitBarText(sale, product)
        : getSaleProgressText(sale, saleTotalAmount)
    const { isFavorite, toggleFavorite } = useUser() || {}
    const productLink = useProductModalLink(product, sales)

    return <Flex
        tag={Link}
        {...productLink}
        col justifyContent='space-between'
        data-action={action}
        data-price={price}
        className={styles.productCard}>
        {/* Always reserve the strip's space so every card has the same layout,
            whether or not it has a sale / progress to show. The inner strip
            slides out of that slot when there is nothing to show. */}
        <Flex className={styles.saleBarSlot}>
            <Flex
                alignItems='center'
                justifyContent='center'
                gap={6}
                className={classNames(styles.saleBar, [styles.saleBarVisible, !!saleBarText])}>
                {saleBarText && <>
                    <Icon name={limitExceeded ? 'warning' : 'salePercent'} size={16} className={styles.saleBarIcon} />
                    <Text size='s' bold className={styles.saleBarText}>{saleBarText}</Text>
                </>}
            </Flex>
        </Flex>
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