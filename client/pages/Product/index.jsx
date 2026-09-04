import { useState } from 'react'
import { useEffect } from 'react'
import { useParams } from 'react-router'
import apiReq from '#common/functions/apiReq.js'
import Loader from '#common/components/Loader'
import { setSalesCache } from '#common/functions/salesCache.js'
import Flex from '#common/components/Flex'
import Image from '#common/components/Image'
import Text from '#common/components/Text'
import HorizontalScroll from '#common/components/HorizontalScroll'
import Icon from '#common/components/Icon'
import classNames from '#common/functions/classNames'
import styles from './product.module.css'
import Breadcrumbs from 'components/Breadcrumbs'
import NotFound from 'pages/NotFound'
import { usePage } from 'layout/Page'
import { ProductButton } from 'pages/Products/ProductCard'
import { ProductSaleBadge, ProductPrice, getUnitInfoText } from 'common/components/Product'

export default function Product() {
    const [selectedImageIndex, setSelectedImageIndex] = useState(0)
    const { productId } = useParams()
    const { loading, pageData } = usePage()
    const { data } = pageData
    const { product, sale, sales, categoryPath } = data || {}
    useEffect(() => { if (sales) setSalesCache(sales) }, [sales])
    useEffect(() => { if (data?.sales) setSalesCache(data.sales) }, [data])
    const productImages = (product?.images?.product || []).filter(img => img?.sizes)
    const images = productImages.length
        ? productImages.map(img => img.sizes.l || img.sizes.xl)
        : ['', '', '', '', '', '']
    const mainImage = productImages.find(img => img?.main)?.sizes?.xl || images[0]

    const price = product?.prices?.[0]?.price

    if (loading) {
        return <Flex className={styles.container}><Loader /></Flex>
    }

    if (!product) {
        if (pageData?.notFound) return <NotFound />
        return <Flex className={styles.container}><Text>מוצר לא נמצא</Text></Flex>
    }

    return (
        <Flex gap={20} col className={styles.container}>
            <Breadcrumbs path={categoryPath ? `products/${categoryPath}` : 'products'} />
            <Flex gap={40} wrap className={styles.body}>

                <Flex className={styles.gallery} col gap={10} alignItems='center'>
                    <div className={styles.mainImageWrapper}>
                        <Image
                            src={mainImage}
                            alt={product.name}
                            width={560}
                            height={560}
                            className={styles.mainImage}
                        />
                    </div>

                    {images.length > 1 && (
                        <HorizontalScroll
                            className={styles.thumbnails}
                            items={images.map((img, idx) => (
                                <Image
                                    key={idx}
                                    src={img}
                                    alt={`${product.name} ${idx + 1}`}
                                    width={120}
                                    height={120}
                                    className={classNames(styles.thumbnail, idx === selectedImageIndex && styles.active)}
                                    onClick={() => setSelectedImageIndex(idx)}
                                    data-active={idx === selectedImageIndex || undefined}
                                />
                            ))}
                        />
                    )}
                </Flex>
                <Flex className={styles.info} col gap={8} width={400}>
                    {price !== undefined && (
                        <div className={styles.priceRow}>
                            <ProductPrice product={product} sales={sales} size="l" />
                        </div>
                    )}

                    {getUnitInfoText(product) && (
                        <Text size='s' className={styles.labelLine}>
                            {getUnitInfoText(product)}
                        </Text>
                    )}

                    <Text size='h1' bold className={styles.productName} style={{ fontSize: '30px' }}>
                        {product.name}
                    </Text>

                    {product.barcode && (
                        <Flex className={styles.barcodeRow} gap={6} alignItems='center'>
                            <Icon name='barcode' size={22} className={styles.barcodeIcon} />
                            <Text size='s' mode='sub'  >
                                {product.barcode}
                            </Text>
                        </Flex>
                    )}

                    <ProductButton product={product} sales={sales || {}} />
                </Flex>
            </Flex>
        </Flex>
    )
}

Product.init = async function (path) {
    const productId = path.split('/').pop()
    const res = await apiReq('product/get', { id: productId })
    const product = res.products?.[0]

    if (!product) {
        return { notFound: true, title: '404' }
    }

    return {
        title: product.name,
        description: product.description || product.name,
        data: { product, sales: res.sales, categoryPath: res.categoryPath }
    }
}