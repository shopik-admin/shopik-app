import { useState } from 'react'
import ScanProduct from './ScanProduct'
import ReplaceProduct from './ReplaceProduct'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Button from 'common/components/Button'
import Image from 'common/components/Image'
import styles from './productPickModal.module.css'
import { isWeightProduct, formatAmount, getUnitLabel, getUnitInfoText, ProductUnitInfo, formatPrice } from 'common/components/Product'
import { getProductImageUrls } from 'common/functions/productImageUrl.js'
import { getLineSummary, isLineNotSupplied } from 'common/functions/orderSummary'
import { round2 } from 'common/functions/calcOrder/utils.js'
import { useText } from 'common/texts/TextProvider'

export default function ProductPickModal({ product = {}, orderId, cart = [], onClose, onPicked }) {
    const weight = isWeightProduct(product)
    const isScanned = product.finalAmount != null || !!product.missing
    const [phase, setPhase] = useState(isScanned ? 'amount' : 'details')
    const initialSupplied = isScanned ? (product.missing ? '' : String(product.finalAmount ?? '')) : ''

    if (phase === 'details') {
        return <ProductDetails
            product={product}
            orderId={orderId}
            onClose={onClose}
            onPicked={onPicked}
            onScan={() => setPhase(weight ? 'weight' : 'scanning')}
            onReplace={() => setPhase('replace')}
        />
    }

    if (phase === 'replace') {
        return <ReplaceProduct
            product={product}
            orderId={orderId}
            cart={cart}
            onClose={onClose}
            onBack={() => setPhase('details')}
            onPicked={onPicked}
        />
    }

    if (phase === 'weight') {
        return <ScanProduct
            product={product}
            orderId={orderId}
            onClose={onClose}
            onPicked={onPicked}
            initialPhase="weight"
            initialSupplied={initialSupplied}
            initialBarcode={product.barcode}
            onReplace={() => setPhase('replace')}
            resettable={isScanned}
        />
    }

    const initialPhase = phase === 'amount' ? 'amount' : 'scanning'
    return <ScanProduct
        product={product}
        orderId={orderId}
        onClose={onClose}
        onPicked={onPicked}
        initialPhase={initialPhase}
        initialSupplied={initialSupplied}
        initialBarcode={product.barcode}
        onReplace={() => setPhase('replace')}
        resettable={isScanned}
    />
}

function ProductDetails({ product = {}, orderId, onClose, onPicked, onScan, onReplace }) {
    const { TR } = useText()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [imgIdx, setImgIdx] = useState(0)

    const productImages = product?.images?.product || []
    const threeSixty = product?.images?.threeSixty || []
    const has360 = threeSixty.length > 0 || productImages.length > 1
    const displayImages = getProductImageUrls(product?.id, productImages, 'l')
    const mainSrc = displayImages[imgIdx] || ''
    const dots = displayImages.length > 1 ? displayImages : (has360 ? Array.from({ length: 5 }) : [])

    // The price the line actually carries (sale included), not the catalog
    // price. The pick is still open, so the checkout money is kept.
    const line = getLineSummary(product, { finalized: false })
    const pricedLine = line?.priced && !isLineNotSupplied(product) && line.units > 0
    const price = pricedLine ? round2(line.charged / line.units) : (product.price ?? product.prices?.[0]?.price)
    const regularPrice = pricedLine && line.saved > 0.005 ? line.unitPrice : null
    const saleLabel = regularPrice
        ? (line.sales.map(sale => sale.name).filter(Boolean).join(' · ') || TR('onSale'))
        : ''
    const barcode = product.barcode || ''
    const storageType = product.storageType
    const isCold = storageType === 'cold' || storageType === 'freeze'
    const ordered = product.amount ?? 1
    const orderedLabel = formatAmount(product, ordered)
    const unitInfo = getUnitInfoText(product)
    const weight = isWeightProduct(product)
    const unitLabel = getUnitLabel(product)
    const recommendations = product.picking?.recommendations

    return <Flex col className={styles.pickModal}>
        <div className={styles.imageWrap}>
            {has360 && (
                <button type="button" className={styles.view360} onClick={() => setImgIdx(i => (i + 1) % Math.max(displayImages.length, 1))}>
                    <span>360°</span>
                </button>
            )}
            {mainSrc ? (
                <Image src={mainSrc} alt={product.name} width={200} height={200} className={styles.mainImage} />
            ) : (
                <div className={styles.placeholder}><Icon name="products" size={32} /></div>
            )}
            {dots.length > 0 && (
                <div className={styles.dots}>
                    {dots.map((_, idx) => (
                        <span key={idx} className={idx === imgIdx ? styles.active : ''} onClick={() => setImgIdx(idx)} style={{ cursor: 'pointer' }} />
                    ))}
                </div>
            )}
            <div className={styles.priceTop}>
                <Flex alignItems="center" gap={4}>
                    <Icon name={isCold ? 'snow' : 'stock'} size={14} />
                    {price != null && <Text size="m" bold className={regularPrice ? styles.salePrice : undefined}>₪{formatPrice(price)}</Text>}
                    {regularPrice != null && <Text size="s" mode="sub" lineThrough>₪{formatPrice(regularPrice)}</Text>}
                </Flex>
                {saleLabel && <Text size="xs" bold className={styles.salePrice}>{saleLabel}</Text>}
            </div>
        </div>

        <Flex col gap={8} className={styles.body}>
            {barcode && <Flex alignItems="center" gap={4} className={styles.barcodeRow}>
                <Icon name="barcode" size={12} />
                <Text size="xs" mode="sub">{barcode}</Text>
            </Flex>}
            <Text bold size="m" className={styles.productName}>{product.name || TR('ops_product_name_fallback')}</Text>
            <Text size="xs" mode="sub">
                {unitInfo ? <><ProductUnitInfo product={product} /> • </> : ''}
                {TR('ops_ordered_amount', { amount: orderedLabel })}
            </Text>

            {error && <Text size="s" mode="error">{error}</Text>}

            <Flex col gap={10} className={styles.actions}>
                <Button loading={loading} onClick={onScan} className={styles.scanBtn}>{TR(weight ? 'ops_enter_weight' : 'ops_scan_product_action')}</Button>
                <Button mode="outline" loading={loading} onClick={onReplace || onScan} className={styles.missingBtn}>{TR('ops_missing_product')}</Button>
            </Flex>
        </Flex>
    </Flex>
}
