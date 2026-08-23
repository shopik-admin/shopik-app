import { useState, useEffect } from 'react'
import { useParams, useLocation } from 'react-router'
import apiReq from '#common/functions/apiReq.js'
import Loader from '#common/components/Loader'
import Flex from '#common/components/Flex'
import Image from '#common/components/Image'
import Text from '#common/components/Text'
import Button from '#common/components/Button'
import HorizontalScroll from '#common/components/HorizontalScroll'
import Icon from '#common/components/Icon'
import classNames from '#common/functions/classNames'
import styles from './product.module.css'
import Breadcrumbs from 'components/Breadcrumbs'
import { usePage } from 'layout/Page'
import { getUnitPriceText } from 'pages/Products/ProductCard'

export default function Product() {
    const [selectedImageIndex, setSelectedImageIndex] = useState(0)
    const { state } = useLocation()
    const { productId } = useParams()
    const stateProduct = state?.product?.id === productId ? state.product : null
    const initialData = stateProduct && {
        title: stateProduct.name,
        description: stateProduct.description || stateProduct.name,
        data: { product: stateProduct }
    }
    const { loading, pageData } = usePage(initialData)
    const { data } = pageData
    const { product, sale } = data
    const productImages = (product?.images?.product || []).filter(img => img?.sizes)
    const images = productImages.length
        ? productImages.map(img => img.sizes.l || img.sizes.xl)
        : ['', '', '', '', '', '']
    const mainImage = productImages.find(img => img?.main)?.sizes?.xl || images[0]

    const price = product?.prices?.[0]?.price
    const unit = product?.unit || {}
    const unitType = unit.type || 'item'
    const unitBase = unit.baseUnit || 'unit'
    const unitAmount = unit.amount || 1

    if (loading) {
        return <Flex className={styles.container}><Loader /></Flex>
    }

    if (!product) {
        return <Flex className={styles.container}><Text>מוצר לא נמצא</Text></Flex>
    }

    return (
        <Flex gap={20} col className={styles.container}>
            <Breadcrumbs path={`products/${product.name}`} />
            <Flex gap={40} wrap className={styles.body}>

                <Flex className={styles.gallery} col gap={10} alignItems='center' flexGrow={1}>
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
                                />
                            ))}
                        />
                    )}
                </Flex>
                <Flex className={styles.info} col gap={8} width={400}>
                    {price !== undefined && (
                        <Flex className={styles.priceRow} gap={8} alignItems='flex-end'>
                            <Text size='h1' bold style={{ fontSize: '48px', lineHeight: 1 }}>
                                {price} ₪
                            </Text>
                            <Text mode='sub' style={{ fontSize: '18px', marginBottom: '4px' }}>
                                {getUnitPriceText(product)}
                            </Text>
                        </Flex>
                    )}

                    {(product.label || unitAmount) && (
                        <Text size='s' className={styles.labelLine}>
                            {product.label ? `${product.label} | ` : ''}
                            {unitType === 'weight' ? `${unitAmount} ${unitBase === 'g' ? 'גרם' : 'ק"ג'}` :
                                unitType === 'pack' ? `${unitAmount} יח'` :
                                    ''}
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

                    <Flex className={styles.actions} gap={10} marginTop='auto'>
                        <Button icon='add' size='l' className={styles.addToCart}>
                            הוסף לסל
                        </Button>
                    </Flex>
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
        throw new Error('Product not found')
    }

    return {
        title: product.name,
        description: product.description || product.name,
        data: { product, sales: res.sales }
    }
}