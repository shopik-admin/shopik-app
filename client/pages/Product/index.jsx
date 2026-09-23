import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import apiReq from '#common/functions/apiReq.js'
import Loader from '#common/components/Loader'
import { setSalesCache } from '#common/functions/salesCache.js'
import Flex from '#common/components/Flex'
import Image from '#common/components/Image'
import Text from '#common/components/Text'
import Button from '#common/components/Button'
import Card from '#common/components/Card'
import Collapse from '#common/components/Collapse'
import Badge from '#common/components/Badge'
import HorizontalScroll from '#common/components/HorizontalScroll'
import Icon from '#common/components/Icon'
import classNames from '#common/functions/classNames'
import styles from './product.module.css'
import Breadcrumbs from 'components/Breadcrumbs'
import NotFound from 'pages/NotFound'
import { usePage } from 'layout/Page'
import { ProductButton } from 'pages/Products/ProductCard'
import ProductCard from 'pages/Products/ProductCard'
import {
    ProductPrice,
    ProductSaleBadge,
    ProductBadges,
    getUnitInfoText
} from 'common/components/Product'

const PASSOVER_TEXT = {
    kosher: 'כשר לפסח',
    'not-kosher': 'לא כשר לפסח',
    special: 'כשר לפסח מהדרין',
    'not-relevant': ''
}

const STORAGE_TEXT = {
    regular: 'אחסון רגיל',
    cold: 'לקירור',
    freeze: 'להקפאה',
    extra: 'אחסון מיוחד'
}

function gs1Text(value) {
    if (value == null || value === '') return ''
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    if (Array.isArray(value)) {
        const parts = value
            .map(v => gs1Text(v?.value ?? v))
            .filter(Boolean)
        return parts.join(', ')
    }
    if (typeof value === 'object') {
        if (value.value != null && value.value !== '') return String(value.value)
        const vals = Object.values(value).map(gs1Text).filter(Boolean)
        return vals.join(', ')
    }
    return ''
}

function nutritionPairs(nutrition) {
    // Real GS1 shape: nutrition.main.table.rows[] = { label, code, fields: [{ text }] }
    const tableRows = nutrition?.main?.table?.rows
    if (Array.isArray(tableRows) && tableRows.length) {
        return tableRows
            .map((r, i) => ({
                id: r?.code || `n${i}`,
                name: r?.label || '',
                text: r?.fields?.[0]?.text || [r?.fields?.[0]?.value, r?.fields?.[0]?.UOM].filter(Boolean).join(' ')
            }))
            .filter(p => p.name || p.text)
            .slice(0, 20)
    }
    // Fallback for other shapes: nutrition.main / additional as arrays or maps
    const rows = []
    const pushSection = (section) => {
        if (!section) return
        if (Array.isArray(section)) {
            section.forEach((entry, i) => {
                if (entry == null) return
                if (typeof entry === 'object') {
                    const name = gs1Text(entry.name || entry.nutrient || entry.title || entry.label || entry.code)
                    const text = entry.text || [gs1Text(entry.value ?? entry.amount ?? entry.quantity), gs1Text(entry.unit || entry.uom || '')].filter(Boolean).join(' ')
                    rows.push({ id: `f${i}-${name}`, name, text: text || gs1Text(entry) })
                } else {
                    rows.push({ id: `f${i}`, name: '', text: String(entry) })
                }
            })
        } else if (typeof section === 'object') {
            Object.entries(section).forEach(([k, v]) => {
                if (k === 'table') return
                const text = gs1Text(v)
                if (text) rows.push({ id: k, name: k, text })
            })
        }
    }
    pushSection(nutrition?.main)
    pushSection(nutrition?.additional)
    return rows.filter(p => p.name || p.text).slice(0, 20)
}

function buildSections(product) {
    const gs1 = product?.gs1 || {}
    const sections = []

    const kashrutLines = []
    if (product?.kashrut) kashrutLines.push({ label: 'כשרות', value: product.kashrut })
    const pass = PASSOVER_TEXT[product?.passoverKashrut]
    if (pass) kashrutLines.push({ label: 'כשרות פסח', value: pass })
    if (kashrutLines.length) {
        sections.push({ key: 'kashrut', title: 'כשרות', icon: 'check', lines: kashrutLines })
    }

    const productLines = []
    const origin = gs1Text(gs1.origin)
    if (origin) productLines.push({ label: 'ארץ ייצור', value: origin })
    if (product?.producer) productLines.push({ label: 'יצרן', value: product.producer })
    const importer = gs1Text(gs1?.ids?.manufacturer?.name)
    if (importer && importer !== product?.producer) productLines.push({ label: 'יבואן', value: importer })
    if (product?.label) productLines.push({ label: 'מותג', value: product.label })
    const net = gs1Text(gs1.netContent?.text || gs1.netContent)
    if (net) productLines.push({ label: 'תכולה', value: net })
    const storageInstr = gs1Text(gs1?.serving?.storage)
    if (storageInstr) productLines.push({ label: 'הוראות אחסון', value: storageInstr })
    else if (product?.storageType) productLines.push({ label: 'אחסון', value: STORAGE_TEXT[product.storageType] || product.storageType })
    if (product?.shelflife) productLines.push({ label: 'חיי מדף', value: `${product.shelflife} ימים` })
    else if (gs1Text(gs1.shelfLife)) productLines.push({ label: 'חיי מדף', value: gs1Text(gs1.shelfLife) })
    if (productLines.length) {
        sections.push({ key: 'details', title: 'נתוני מוצר', icon: 'info', lines: productLines })
    }

    if (product?.regulatoryInfo) {
        sections.push({ key: 'ingredients', title: 'רכיבים', icon: 'clipboardList', body: product.regulatoryInfo })
    }

    const nutrientFlags = []
    if (product?.nutrients?.sugar) nutrientFlags.push('סוכר בכמות גבוהה')
    if (product?.nutrients?.sodium) nutrientFlags.push('נתרן בכמות גבוהה')
    if (product?.nutrients?.fat) nutrientFlags.push('שומן רווי בכמות גבוהה')
    if (product?.nutrients?.alcohol) nutrientFlags.push('מכיל אלכוהול')
    const pairs = nutritionPairs(gs1?.nutrition)
    const servingText = gs1Text(gs1?.serving?.suggestion || gs1?.serving?.size)
    if (nutrientFlags.length || pairs.length || servingText) {
        sections.push({
            key: 'nutrition',
            title: 'ערכים תזונתיים',
            icon: 'calculator',
            flags: nutrientFlags,
            pairs,
            extra: servingText
        })
    }

    const marketing = gs1Text(gs1?.marketing?.messages)
    const desc = [product?.description, marketing].filter(Boolean).join('\n\n')
    if (desc) {
        sections.push({ key: 'desc', title: 'תיאור המוצר', icon: 'note', body: desc })
    }

    return sections
}

function SectionBody({ section }) {
    if (!section) return null
    return (
        <Flex col gap={0}>
            {section.lines?.map((l, i) => (
                <Flex key={i} justifyContent="space-between" gap={12} className={styles.kvRow}>
                    <Text size="s" bold className={styles.kvLabel}>{l.label}</Text>
                    <Text size="s" className={styles.kvValue}>{l.value}</Text>
                </Flex>
            ))}
            {section.flags?.length > 0 && (
                <Flex gap={6} wrap className={styles.flagWrap}>
                    {section.flags.map(f => (
                        <Badge key={f} className={styles.flag}>{f}</Badge>
                    ))}
                </Flex>
            )}
            {section.pairs?.length > 0 && (
                <div className={styles.nutGrid}>
                    {section.pairs.map(p => (
                        <Flex key={p.id} justifyContent="space-between" gap={8} className={styles.nutCell}>
                            <Text size="s" bold>{p.name}</Text>
                            <Text size="s">{p.text}</Text>
                        </Flex>
                    ))}
                </div>
            )}
            {section.extra && <Text size="s" mode="sub" className={styles.specExtra}>{section.extra}</Text>}
            {section.body && <Text size="s" className={styles.specBody}>{section.body}</Text>}
        </Flex>
    )
}

export default function Product() {
    const [selectedImageIndex, setSelectedImageIndex] = useState(0)
    const [wishlisted, setWishlisted] = useState(false)
    const [activeSpecKey, setActiveSpecKey] = useState(null)
    const { productId } = useParams()
    const { loading, pageData } = usePage()
    const { data } = pageData
    const { product, sales, categoryPath, related, relatedSales } = data || {}
    const mergedSales = useMemo(() => ({ ...(relatedSales || {}), ...(sales || {}) }), [sales, relatedSales])
    useEffect(() => { if (sales) setSalesCache(sales) }, [sales])
    useEffect(() => { if (data?.sales) setSalesCache(data.sales) }, [data])
    useEffect(() => { if (mergedSales && Object.keys(mergedSales).length) setSalesCache(mergedSales) }, [mergedSales])
    useEffect(() => { setSelectedImageIndex(0); setWishlisted(false); setActiveSpecKey(null) }, [productId, product?.id])

    const productImages = (product?.images?.product || []).filter(img => img?.sizes)
    const images = productImages.length
        ? productImages.map(img => img.sizes.xl || img.sizes.l || img.sizes.m)
        : []
    const thumbImages = productImages.length
        ? productImages.map(img => img.sizes.m || img.sizes.s || img.sizes.l || img.sizes.xl)
        : []
    const mainImage = images[selectedImageIndex] || images[0] || ''
    const has360 = (product?.images?.threeSixty || []).length > 0
    const sections = useMemo(() => buildSections(product || {}), [product])
    const activeSection = sections.find(s => s.key === activeSpecKey) || sections[0]
    const relatedList = (related || []).filter(p => p?.id !== product?.id)

    if (loading) {
        return <Flex className={styles.container}><Loader /></Flex>
    }

    if (!product) {
        if (pageData?.notFound) return <NotFound />
        return <Flex className={styles.container}><Text>מוצר לא נמצא</Text></Flex>
    }

    return (
        <Flex col className={styles.container}>
            <div className={styles.crumbs}>
                <Breadcrumbs path={categoryPath ? `products/${categoryPath}` : 'products'} />
            </div>

            <div className={styles.body}>
                <div className={styles.infoMain}>
                    <div className={styles.priceRow}>
                        <ProductPrice product={product} sales={sales} size="l" />
                        <Button
                            mode="text"
                            icon="heart"
                            aria-label="wishlist"
                            className={classNames(styles.wish, wishlisted && styles.wishActive)}
                            onClick={() => setWishlisted(w => !w)}
                        />
                    </div>

                    {getUnitInfoText(product) && (
                        <Text size="s" mode="sub" className={styles.labelLine}>
                            {getUnitInfoText(product)}
                        </Text>
                    )}

                    <Text size="h1" bold className={styles.productName}>
                        {product.name}
                    </Text>

                    {product.barcode && (
                        <Flex className={styles.barcodeRow} gap={6} alignItems="center">
                            <Icon name="barcode" size={20} className={styles.barcodeIcon} />
                            <Text size="s" mode="sub">{product.barcode}</Text>
                        </Flex>
                    )}

                    <ProductBadges product={product} sales={sales} />
                    {(product.kashrut || product.passoverKashrut) && (
                        <Flex className={styles.badgeRow} gap={6} wrap>
                            {product.kashrut && <Badge>{product.kashrut}</Badge>}
                            {PASSOVER_TEXT[product.passoverKashrut] && (
                                <Badge>{PASSOVER_TEXT[product.passoverKashrut]}</Badge>
                            )}
                        </Flex>
                    )}
                </div>

                <div className={styles.gallery}>
                    <div className={styles.mainImageWrapper}>
                        <Image
                            src={mainImage}
                            alt={product.name}
                            width="100%"
                            height="100%"
                            className={styles.mainImage}
                        />
                        <ProductSaleBadge product={product} sales={sales} size="m" />
                        {has360 && (
                            <Badge className={styles.spin360}>
                                <Flex gap={4} alignItems="center">
                                    <Icon name="refresh" size={14} />
                                    <Text size="s">360°</Text>
                                </Flex>
                            </Badge>
                        )}
                    </div>

                    {images.length > 1 && (
                        <>
                            <Flex className={styles.dots} gap={6} justifyContent="center" role="tablist" aria-label="product images">
                                {images.map((_, idx) => (
                                    <Button
                                        key={idx}
                                        mode="text"
                                        aria-label={`image ${idx + 1}`}
                                        className={classNames(styles.dot, idx === selectedImageIndex && styles.dotActive)}
                                        onClick={() => setSelectedImageIndex(idx)}
                                    />
                                ))}
                            </Flex>
                            <HorizontalScroll
                                className={styles.thumbnails}
                                items={thumbImages.map((img, idx) => (
                                    <Image
                                        key={`${img}-${idx}`}
                                        src={img}
                                        alt={`${product.name} ${idx + 1}`}
                                        className={classNames(styles.thumbnail, idx === selectedImageIndex && styles.active)}
                                        onClick={() => setSelectedImageIndex(idx)}
                                        data-active={idx === selectedImageIndex || undefined}
                                    />
                                ))}
                            />
                        </>
                    )}
                </div>

                <div className={styles.purchase}>
                    <ProductButton product={product} sales={sales || {}} />
                </div>

                <div className={styles.specs}>
                    {sections.length > 0 && (
                        <>
                            <Card className={styles.specCard}>
                                <div className={styles.specLayout}>
                                    <Flex col gap={2} className={styles.specNav}>
                                        {sections.map(s => (
                                            <Button
                                                key={s.key}
                                                mode="text"
                                                icon={s.icon}
                                                className={classNames(
                                                    styles.specTab,
                                                    activeSection?.key === s.key && styles.specTabActive
                                                )}
                                                onClick={() => setActiveSpecKey(s.key)}
                                            >
                                                <Text size="s" bold>{s.title}</Text>
                                            </Button>
                                        ))}
                                    </Flex>
                                    <div className={styles.specContent}>
                                        {activeSection && <SectionBody section={activeSection} />}
                                    </div>
                                </div>
                            </Card>
                            <Flex col gap={8} className={styles.collapses}>
                                {sections.map((s, i) => (
                                    <Collapse
                                        key={s.key}
                                        defaultOpen={i === 0}
                                        title={
                                            <Flex gap={8} alignItems="center">
                                                <Icon name={s.icon} size={16} />
                                                <Text size="s" bold>{s.title}</Text>
                                            </Flex>
                                        }
                                    >
                                        <SectionBody section={s} />
                                    </Collapse>
                                ))}
                            </Flex>
                        </>
                    )}
                    <Text size="xs" mode="sub" className={styles.disclaimer}>
                        התמונות להמחשה בלבד. המידע על המוצר, הרכיבים והערכים התזונתיים עשוי להשתנות — יש לעיין באריזה.
                    </Text>
                </div>
            </div>

            {relatedList.length > 0 && (
                <div className={styles.related}>
                    <Text size="h2" bold className={styles.relatedTitle}>מוצרים שעשויים לעניין אותך</Text>
                    <HorizontalScroll
                        className={styles.relatedScroll}
                        items={relatedList.map(p => {
                            const psales = (p.saleIds || []).reduce((acc, sId) => {
                                if (mergedSales[sId]) acc[sId] = mergedSales[sId]
                                return acc
                            }, {})
                            return (
                                <div key={p.id} className={styles.relatedCard}>
                                    <ProductCard product={p} sales={psales} size="m" />
                                </div>
                            )
                        })}
                    />
                </div>
            )}
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

    let related = []
    let relatedSales = {}
    try {
        const catId = product?.category?.pathIds?.slice(-1)?.[0] || product?.category?.id
        if (catId) {
            const rel = await apiReq('product/get', {
                filter: { 'category.pathIds': catId },
                limit: 11
            })
            related = (rel.products || []).filter(p => p.id !== product.id).slice(0, 10)
            relatedSales = rel.sales || {}
        }
    } catch {
        related = []
    }

    return {
        title: product.name,
        description: product.description || product.name,
        data: { product, sales: res.sales, categoryPath: res.categoryPath, related, relatedSales }
    }
}
