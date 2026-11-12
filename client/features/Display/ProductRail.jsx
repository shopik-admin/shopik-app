import { Link } from 'react-router'
import HorizontalScroll from '#common/components/HorizontalScroll'
import Flex from '#common/components/Flex'
import Text from '#common/components/Text'
import Icon from '#common/components/Icon'
import ProductCard from 'pages/Products/ProductCard'
import styles from './display.module.css'

function salesFor(product, sales) {
    if (!product?.saleIds?.length || !sales) return {}
    return product.saleIds.reduce(
        (acc, saleId) => sales[saleId] ? { ...acc, [saleId]: sales[saleId] } : acc,
        {}
    )
}

// Shared product rail. Home page carousels and the product page's related
// products render through this component so both keep the exact same design
// (full-bleed band, header, large arrows, 260px cards).
export default function ProductRail({
    title,
    products = [],
    sales = {},
    autoplaySec = 0,
    showAllTo,
    showAllText = 'display_show_all_default'
}) {
    if (!products.length) return null

    return <Flex col gap={8} className={styles.rail}>
        <Flex className={styles.railHeader} alignItems='end'>
            <Text size='h1' bold className={styles.railTitle}>{title}</Text>
            {showAllTo && (
                <Link to={showAllTo} className={styles.showAll}>
                    <Text mode='link' bold size='xl' className={styles.showAllText}>{showAllText}</Text>
                    <Icon name='left' size={24} />
                </Link>
            )}
        </Flex>
        <HorizontalScroll
            autoplaySec={autoplaySec}
            itemClassName={styles.railCard}
            largeArrows
            items={products.map(p => (
                <ProductCard key={p.id} product={p} sales={salesFor(p, sales)} />
            ))}
        />
    </Flex>
}
