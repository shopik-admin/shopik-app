import { useEffect, useRef, useState } from 'react'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Button from 'common/components/Button'
import ProductInline from 'common/components/ProductInline'
import styles from './replaceProduct.module.css'
import apiReq from 'common/functions/apiReq'
import useApi from 'common/functions/useApi'
import classNames from 'common/functions/classNames'
import { isWeightProduct, getUnitLabel, ProductUnitInfo, formatAmount, formatPrice, ProductImage, getFirstSale, getSalePriceInfo, getSaleBadgeText } from 'common/components/Product'
import { getPickRange, isPickInRange, DEFAULT_PICK_LIMITS } from 'common/functions/pickLimits'
import { setSalesCache } from 'common/functions/salesCache.js'
import limitDecimalInput from 'common/functions/decimalInput'
import { isProductInCart } from 'common/functions/cartReplacements'
import { useText } from 'common/texts/TextProvider'

export default function ReplaceProduct({ product = {}, orderId, cart = [], onClose, onPicked }) {
    const { TR } = useText()
    const [phase, setPhase] = useState('list') // list | scanning | amount
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [sales, setSales] = useState({})
    const [searching, setSearching] = useState(false)
    const [selected, setSelected] = useState(null)
    const [supplied, setSupplied] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [scanError, setScanError] = useState('')
    const [manualBarcode, setManualBarcode] = useState('')
    const [manualMode, setManualMode] = useState(false)

    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const rafRef = useRef(null)
    const detectorRef = useRef(null)
    const scanningRef = useRef(false)
    const debounceRef = useRef(null)

    const ordered = product.amount ?? 1
    const orderedLabel = formatAmount(product, ordered)
    const origBarcode = String(product.barcode || '').trim()

    const repWeight = selected ? isWeightProduct(selected) : false
    const repUnitLabel = selected ? getUnitLabel(selected) : ''
    const suppliedNum = supplied === '' ? null : Number(supplied)
    const isSuppliedValid = supplied !== '' && !isNaN(suppliedNum) && suppliedNum > 0
    // Same deviation limits as direct picking, judged by the replacement
    // product's unit type vs the original ordered amount.
    const { data: pickLimitsData } = useApi('order/ops/pick_limits', { id: orderId })
    const pickLimits = pickLimitsData || DEFAULT_PICK_LIMITS
    const repPickRange = selected ? getPickRange(ordered, repWeight, pickLimits) : null
    const repOutOfRange = isSuppliedValid && !!selected && !!repPickRange && !isPickInRange(suppliedNum, ordered, repWeight, pickLimits)
    const repRangeLabel = repPickRange
        ? (repWeight
            ? `${formatAmount(selected, Math.round(repPickRange.min * 1000) / 1000)} – ${formatAmount(selected, Math.round(repPickRange.max * 1000) / 1000)}`
            : TR('ops_up_to', { amount: formatAmount(selected, repPickRange.max) }))
        : ''
    const canContinue = isSuppliedValid && !!selected && !repOutOfRange

    // A candidate's real price: its active sale when it takes part in one.
    // The suggestions/scans response carries those sales, so the picker sees
    // the price the replacement will actually be charged at. A multi-buy
    // bundle only pays off once its size is reached, so it keeps the regular
    // unit price and is flagged by the sale tag instead.
    function priceFor(p) {
        const base = p?.price ?? p?.prices?.[0]?.price
        if (base == null) return null
        const sale = getFirstSale(p, sales)
        const info = sale ? getSalePriceInfo({ ...p, price: base }, sale) : null
        if (!info) return { price: base, regular: null, saleLabel: '' }
        if (info.isBundle) return { price: base, regular: null, saleLabel: getSaleBadgeText(sale) }
        return { price: info.saleSingle, regular: info.regular, saleLabel: getSaleBadgeText(sale) }
    }

    async function loadSuggestions(text) {
        setSearching(true)
        setError('')
        try {
            const t = String(text ?? '').trim()
            const route = t ? 'product/search' : 'order/ops/suggest_replacements'
            const payload = t
                ? { value: t, limit: 20 }
                : { id: orderId, barcode: product.barcode, limit: 20 }
            const res = await apiReq(route, payload)
            if (res?.error) {
                setError(res.error)
                return
            }
            const list = (res?.products || [])
                .filter(p => String(p.barcode || '').trim() !== origBarcode)
                .filter(p => !isProductInCart(p, cart))
            setResults(list)
            // Candidates carry the active sales that price them; the same cache
            // keeps a replacement line showing its sale once it is in the cart.
            if (res?.sales) {
                setSales(res.sales)
                setSalesCache(res.sales)
            }
        } catch (e) {
            setError(e.message || 'search failed')
        } finally {
            setSearching(false)
        }
    }

    useEffect(() => {
        loadSuggestions('')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (query)
            debounceRef.current = setTimeout(() => loadSuggestions(query), 350)
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query])

    function chooseCandidate(p) {
        if (!p) return
        setSelected(p)
        setSupplied(String(ordered))
        setScanError('')
        setPhase('amount')
    }

    async function handleMissing() {
        if (loading) return
        setLoading(true)
        setError('')
        try {
            const res = await apiReq('order/ops/pick_item', {
                id: orderId,
                barcode: product.barcode,
                action: 'missing',
                missingReason: 'missing'
            })
            if (res?.error) setError(res.error)
            else {
                onPicked?.(res)
                onClose?.()
            }
        } catch (e) {
            setError(e?.message || 'missing failed')
        } finally {
            setLoading(false)
        }
    }

    async function handleConfirm() {
        if (!canContinue || loading) return
        setLoading(true)
        setError('')
        try {
            const res = await apiReq('order/ops/pick_item', {
                id: orderId,
                barcode: product.barcode,
                action: 'replace',
                replacement: { replacementBarcode: selected.barcode, amount: suppliedNum }
            })
            if (res?.error) {
                setError(res.error)
                return
            }
            onPicked?.(res)
            onClose?.()
        } catch (e) {
            setError(e.message || 'replace failed')
        } finally {
            setLoading(false)
        }
    }

    function stopCamera() {
        scanningRef.current = false
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }

    async function handleScannedBarcode(raw) {
        const val = String(raw ?? '').trim()
        if (!val) return
        if (val === origBarcode) {
            setScanError(TR('ops_scan_original_barcode'))
            return
        }
        setSearching(true)
        setScanError('')
        try {
            const res = await apiReq('product/get', { barcode: val })
            if (res?.error) {
                setScanError(res.error)
                return
            }
            const found = res?.products?.[0]
            if (!found) {
                setScanError(TR('ops_product_not_found', { barcode: val }))
                return
            }
            if (isProductInCart(found, cart)) {
                setScanError(TR('ops_product_already_in_cart'))
                return
            }
            if (res?.sales) {
                setSales(res.sales)
                setSalesCache(res.sales)
            }
            stopCamera()
            chooseCandidate(found)
        } catch (e) {
            setScanError(e.message || 'lookup failed')
        } finally {
            setSearching(false)
        }
    }

    function handleManualSubmit(e) {
        e?.preventDefault()
        if (!manualBarcode.trim()) return
        handleScannedBarcode(manualBarcode.trim())
    }

    async function startCamera() {
        setScanError('')
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            })
            streamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                await videoRef.current.play()
            }

            if (!('BarcodeDetector' in window)) {
                try {
                    await import('barcode-detector/polyfill')
                } catch { }
            }

            if ('BarcodeDetector' in window) {
                try {
                    detectorRef.current = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] })
                } catch {
                    detectorRef.current = new window.BarcodeDetector()
                }
                const loop = async () => {
                    if (!scanningRef.current || !videoRef.current || videoRef.current.readyState < 2) {
                        rafRef.current = requestAnimationFrame(loop)
                        return
                    }
                    try {
                        const codes = await detectorRef.current.detect(videoRef.current)
                        if (codes && codes.length) {
                            const val = codes[0].rawValue
                            if (val) {
                                handleScannedBarcode(val)
                                return
                            }
                        }
                    } catch { }
                    rafRef.current = requestAnimationFrame(loop)
                }
                rafRef.current = requestAnimationFrame(loop)
            } else {
                setManualMode(true)
            }
        } catch (err) {
            setScanError(err.message || TR('ops_camera_error'))
            setManualMode(true)
        }
    }

    useEffect(() => {
        if (phase !== 'scanning') return
        scanningRef.current = true
        startCamera()
        return () => stopCamera()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase])

    function goToScanning() {
        setScanError('')
        setManualBarcode('')
        setPhase('scanning')
    }

    function goToList() {
        stopCamera()
        setScanError('')
        setManualBarcode('')
        setPhase('list')
    }

    if (phase === 'amount' && selected) {
        const repPrice = priceFor(selected)
        const repBarcode = selected.barcode || ''
        const repIsCold = selected.storageType === 'cold' || selected.storageType === 'freeze'
        return <Flex col className={styles.replaceProduct}>
            <Flex alignItems="center" className={styles.header}>
                <Button mode="text" size="s" onClick={() => setPhase('list')} className={styles.backBtn}>{TR('back')}</Button>
                <Text size="m" bold>{TR('ops_replacement_confirm_title')}</Text>
                <span className={styles.closeSlot} aria-hidden />
            </Flex>

            <Flex col className={styles.linkedCard}>
                <Text size="xs" mode="sub">{TR('ops_original_product_ordered', { amount: orderedLabel })}</Text>
                <Text size="s" bold>{product.name || TR('ops_product_name_fallback')}</Text>
                {origBarcode && <Text size="xs" mode="sub">{origBarcode}</Text>}
            </Flex>

            <Flex col className={styles.linkedCard}>
                <Flex col gap={2}>
                    <Flex alignItems="center" gap={6}>
                        <Icon name={repIsCold ? 'snow' : 'stock'} size={14} />
                        {repPrice && <Text size="m" bold className={repPrice.regular != null ? styles.salePrice : undefined}>₪{formatPrice(repPrice.price)}</Text>}
                        {repPrice?.regular != null && <Text size="xs" mode="sub" lineThrough>₪{formatPrice(repPrice.regular)}</Text>}
                        <Text size="xs" mode="sub"><ProductUnitInfo product={selected} /></Text>
                    </Flex>
                    {repPrice?.saleLabel && <Text size="xs" bold className={styles.salePrice}>{repPrice.saleLabel}</Text>}
                </Flex>
                <Flex gap={10} alignItems="center">
                    <ProductImage product={selected} size="s" hideSaleBadge />
                    <Flex col gap={4} grow={1}>
                        <Text size="s" bold>{selected.name}</Text>
                        {repBarcode && <Text size="xs" mode="sub">{repBarcode}</Text>}
                    </Flex>
                </Flex>
            </Flex>

            <Flex center>
                <Text size="m" bold>{TR('ops_enter_replacement_amount')}</Text>
            </Flex>

            <Flex className={styles.amountRow} alignItems="stretch">
                <Flex col center className={styles.orderedBox}>
                    <Text size="m" bold>{orderedLabel}</Text>
                    <Text size="xs" mode="sub">{TR('col_ordered')}</Text>
                </Flex>
                <Flex col center className={classNames(styles.suppliedBox, [styles.empty, supplied === ''], [styles.match, isSuppliedValid && suppliedNum === ordered], [styles.warning, isSuppliedValid && suppliedNum !== ordered])}>
                    <input
                        value={supplied}
                        onChange={e => setSupplied(limitDecimalInput(e.target.value, 3))}
                        placeholder="—"
                        className={styles.suppliedInput}
                        inputMode={repWeight ? 'decimal' : 'numeric'}
                        autoFocus
                    />
                    <Text size="xs" mode="sub">{TR('col_supplied')}{repWeight ? ` (${repUnitLabel})` : ''}</Text>
                </Flex>
            </Flex>

            {error && <Flex center><Text size="s" mode="error">{error}</Text></Flex>}
            {repOutOfRange && (
                <Flex col center gap={4}>
                    <Text size="s" bold mode="error">{TR('ops_amount_exceeds_allowed')}</Text>
                    {repRangeLabel && <Text size="xs" mode="sub">{TR('ops_allowed_prefix', { amount: repRangeLabel })}</Text>}
                </Flex>
            )}

            <Flex col gap={10} className={styles.stickyFooter}>
                <Button disabled={!canContinue} loading={loading} onClick={handleConfirm} className={styles.confirmBtn}>{TR('ops_confirm_replacement')}</Button>
            </Flex>
        </Flex>
    }

    if (phase === 'scanning') {
        return <Flex col className={styles.replaceProduct}>
            <Flex alignItems="center" className={styles.header}>
                <Text size="m" bold>{TR('ops_replacement_title')}</Text>
                <span className={styles.closeSlot} aria-hidden />
            </Flex>

            <Flex col className={styles.originalWrap}>
                <ProductInline product={product} remove={false} note={false} admin />
            </Flex>

            <Flex alignItems="center" className={styles.searchBar}>
                <Button mode="text" size="s" onClick={goToList} className={styles.iconBtn}>✕</Button>
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={TR('ops_scan_replacement')}
                    className={styles.searchInput}
                />
                <Icon name="barcode" size={18} />
            </Flex>
            <Button mode="text" size="s" onClick={goToList} className={styles.backBtn}>{TR('ops_back_to_list')}</Button>

            <Flex col className={styles.cameraWrap}>
                <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
                <div className={styles.overlay}>
                    <span className={styles.corner + ' ' + styles.tl} />
                    <span className={styles.corner + ' ' + styles.tr} />
                    <span className={styles.corner + ' ' + styles.bl} />
                    <span className={styles.corner + ' ' + styles.br} />
                </div>
                {scanError && <Flex center className={styles.errorOverlay}><Text size="s" mode="error">{scanError}</Text></Flex>}
                {(manualMode || scanError) && (
                    <Flex tag="form" onSubmit={handleManualSubmit} className={styles.manualForm}>
                        <input
                            value={manualBarcode}
                            onChange={e => setManualBarcode(e.target.value)}
                            placeholder={TR('ops_enter_replacement_barcode')}
                            className={styles.manualInput}
                            autoFocus
                        />
                        <Button type="submit" loading={searching}>{TR('confirm')}</Button>
                    </Flex>
                )}
            </Flex>

            <Flex col gap={10} className={styles.stickyFooter}>
                <Button mode="outline" loading={loading} onClick={handleMissing} className={styles.missingBtn}>{TR('ops_missing_product')}</Button>
            </Flex>
        </Flex>
    }

    return <Flex col className={styles.replaceProduct}>
        <Flex alignItems="center" className={styles.header}>
            <Text size="m" bold>{TR('ops_replacement_title')}</Text>
            <span className={styles.closeSlot} aria-hidden />
        </Flex>

        <Flex col className={styles.originalWrap}>
            <ProductInline product={product} remove={false} note={false} admin />
        </Flex>

        <Flex alignItems="center" className={styles.searchBar}>
            <Icon name="barcode" size={18} />
            <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={TR('ops_search_replacement')}
                className={styles.searchInput}
            />
            <Button mode="text" size="s" onClick={goToScanning} className={styles.iconBtn}>{TR('ops_scan')}</Button>
        </Flex>

        {error && <Flex center><Text size="s" mode="error">{error}</Text></Flex>}

        <Flex col className={styles.list}>
            {searching && !results.length ? <Flex center><Text size="s" mode="sub">{TR('ops_searching')}</Text></Flex> : null}
            {!searching && !results.length ? <Flex center><Text size="s" mode="sub">{TR('ops_no_replacements')}</Text></Flex> : null}
            {results.map(p => {
                const price = priceFor(p)
                const isCold = p.storageType === 'cold' || p.storageType === 'freeze'
                return <Flex col key={p.id || p.barcode} className={styles.rowCard}>
                    <Flex col gap={2} className={styles.rowTop}>
                        <Flex alignItems="center" gap={6}>
                            <Icon name={isCold ? 'snow' : 'stock'} size={14} />
                            {price && <Text size="m" bold className={price.regular != null ? styles.salePrice : undefined}>₪{formatPrice(price.price)}</Text>}
                            {price?.regular != null && <Text size="xs" mode="sub" lineThrough>₪{formatPrice(price.regular)}</Text>}
                            <Text size="xs" mode="sub"><ProductUnitInfo product={p} /></Text>
                        </Flex>
                        {price?.saleLabel && <Text size="xs" bold className={styles.salePrice}>{price.saleLabel}</Text>}
                    </Flex>
                    <Flex gap={10} alignItems="center">
                        <ProductImage product={p} size="s" hideSaleBadge />
                        <Flex col gap={4} grow={1}>
                            <Text size="s" bold>{p.name}</Text>
                            {p.barcode && <Flex alignItems="center" gap={4}>
                                <Icon name="barcode" size={12} />
                                <Text size="xs" mode="sub">{p.barcode}</Text>
                            </Flex>}
                        </Flex>
                    </Flex>
                    <Button onClick={() => chooseCandidate(p)} className={styles.selectBtn}>{TR('ops_choose_replacement')}</Button>
                </Flex>
            })}
        </Flex>

        <Flex col gap={10} className={styles.stickyFooter}>
            <Button mode="outline" loading={loading} onClick={handleMissing} className={styles.missingBtn}>{TR('ops_missing_product')}</Button>
        </Flex>
    </Flex>
}
