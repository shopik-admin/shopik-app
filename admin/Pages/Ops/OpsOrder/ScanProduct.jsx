import { useEffect, useRef, useState } from 'react'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Button from 'common/components/Button'
import ProductInline from 'common/components/ProductInline'
import styles from './scanProduct.module.css'
import apiReq from 'common/functions/apiReq'
import useApi from 'common/functions/useApi'
import classNames from 'common/functions/classNames'
import { isWeightProduct, getUnitLabel, formatAmount } from 'common/components/Product'
import { getPickRange, isPickInRange, DEFAULT_PICK_LIMITS } from 'common/functions/pickLimits'
import limitDecimalInput from 'common/functions/decimalInput'
import { useText } from 'common/texts/TextProvider'
import FlowHeader from './FlowHeader'

export default function ScanProduct({ product = {}, orderId, onClose, onBack, onPicked, initialPhase, initialSupplied, initialBarcode, onReplace, resettable = false }) {
    const { TR } = useText()
    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const rafRef = useRef(null)
    const detectorRef = useRef(null)
    const scanningRef = useRef(true)
    const [error, setError] = useState('')
    const [scanning, setScanning] = useState(true)
    const [manualMode, setManualMode] = useState(false)
    const [manualBarcode, setManualBarcode] = useState('')
    const [loading, setLoading] = useState(false)
    const [resetLoading, setResetLoading] = useState(false)
    const [phase, setPhase] = useState(initialPhase || 'scanning') // scanning | amount | weight
    const [scannedBarcode, setScannedBarcode] = useState(initialBarcode || '')
    const [mismatch, setMismatch] = useState(null) // wrong barcode that was scanned
    const [supplied, setSupplied] = useState(initialSupplied != null ? String(initialSupplied) : '')

    const normalizeBarcode = v => String(v ?? '').trim()
    const expectedBarcodes = [
        product.barcode,
        ...(Array.isArray(product.scannableBarcodes) ? product.scannableBarcodes : [])
    ].map(normalizeBarcode).filter(Boolean)
    const isBarcodeMatch = scanned => {
        const val = normalizeBarcode(scanned)
        if (!val) return false
        if (!expectedBarcodes.length) return true
        return expectedBarcodes.includes(val)
    }

    const price = product.price ?? product.prices?.[0]?.price ?? 36
    const ordered = product.amount || 22
    const weight = isWeightProduct(product)
    const unitLabel = getUnitLabel(product)
    const orderedLabel = formatAmount(product, ordered)

    const suppliedNum = supplied === '' ? null : Number(supplied)
    const isSuppliedEmpty = supplied === ''
    const isSuppliedValid = !isSuppliedEmpty && !isNaN(suppliedNum) && suppliedNum > 0
    // Deviation limits from the pickLimits setting (hard block; server re-validates).
    // Weight: ordered*(1-down)..ordered*(1+up). Quantity: up to ordered+5, no lower bound.
    const { data: pickLimitsData } = useApi('order/ops/pick_limits', { id: orderId })
    const pickLimits = pickLimitsData || DEFAULT_PICK_LIMITS
    const pickRange = getPickRange(ordered, weight, pickLimits)
    const outOfRange = isSuppliedValid && !!pickRange && !isPickInRange(suppliedNum, ordered, weight, pickLimits)
    const rangeLabel = pickRange
        ? (weight
            ? `${formatAmount(product, Math.round(pickRange.min * 1000) / 1000)} – ${formatAmount(product, Math.round(pickRange.max * 1000) / 1000)}`
            : TR('ops_up_to', { amount: formatAmount(product, pickRange.max) }))
        : ''
    const isMatch = isSuppliedValid && suppliedNum === ordered
    const isWarning = isSuppliedValid && !outOfRange && !isMatch
    // yellow warning when different but within range
    const isError = !!outOfRange
    const canContinue = isSuppliedValid && !outOfRange

    async function proceedWithFinalAmount() {
        if (!canContinue || loading) return
        // safety: never trust the scanned value as the item identifier —
        // always pick by the expected product barcode, send scanned for server audit
        if (!weight && scannedBarcode && !isBarcodeMatch(scannedBarcode)) {
            setError(TR('ops_barcode_mismatch_expected', { scanned: scannedBarcode, expected: product.barcode || '' }))
            return
        }
        setLoading(true)
        setError('')
        try {
            const action = weight ? 'weight' : 'scan'
            const res = await apiReq('order/ops/pick_item', {
                id: orderId,
                barcode: product.barcode,
                scannedBarcode: weight ? undefined : (scannedBarcode || undefined),
                action,
                finalAmount: suppliedNum
            })
            if (res?.error) {
                setError(res.error)
                return
            }
            onPicked?.(res)
            onClose?.()
        } catch (e) {
            setError(e.message || 'scan failed')
        } finally {
            setLoading(false)
        }
    }

    function stopCamera() {
        scanningRef.current = false
        setScanning(false)
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }

    function handleScanned(scannedBarcodeValue) {
        const val = normalizeBarcode(scannedBarcodeValue)
        if (!val) return
        if (!isBarcodeMatch(val)) {
            // wrong product — stay in scanning phase, show mismatch
            stopCamera()
            setMismatch(val)
            setError(TR('ops_barcode_mismatch_retry', { scanned: val, expected: product.barcode || '' }))
            return
        }
        // correct product
        stopCamera()
        setMismatch(null)
        setScannedBarcode(val)
        setSupplied('')
        setPhase('amount')
        setError('')
    }

    async function handleRetryScan() {
        setMismatch(null)
        setError('')
        setManualBarcode('')
        setScanning(true)
        scanningRef.current = true
        await startCamera()
    }

    function handleManualSubmit(e) {
        e?.preventDefault()
        if (!manualBarcode.trim()) return
        handleScanned(manualBarcode.trim())
    }

    async function startCamera() {
        setError('')
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

            // lazy polyfill (Sec-ant/barcode-detector): keep native 0kb fast-path, load zxing-wasm only on Firefox/Safari
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
                                handleScanned(val)
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
            setError(err.message || TR('ops_camera_error'))
            setManualMode(true)
        }
    }

    useEffect(() => {
        if (phase !== 'scanning') return
        scanningRef.current = true
        startCamera()
        return () => {
            scanningRef.current = false
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
        }
    }, [phase])

    async function handleMissing() {
        if (loading) return
        setLoading(true)
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
            setError(e.message || 'missing failed')
        } finally {
            setLoading(false)
        }
    }

    async function handleReturnToPick() {
        if (resetLoading) return
        setResetLoading(true)
        try {
            const res = await apiReq('order/ops/pick_item', {
                id: orderId,
                barcode: product.barcode,
                action: 'reset'
            })
            if (res?.error) setError(res.error)
            else {
                onPicked?.(res)
                onClose?.()
            }
        } catch (e) {
            setError(e.message || 'return to pick failed')
        } finally {
            setResetLoading(false)
        }
    }

    if (phase === 'amount' || phase === 'weight') {
        const isWeightPhase = weight || phase === 'weight'
        return <Flex col className={styles.scanProduct}>
            <FlowHeader
                title={isWeightPhase ? 'ops_weigh_product_title' : 'ops_scan_product_title'}
                onBack={onBack}
                onClose={onClose}
            />

            <Flex col className={styles.productSummary}>
                {/*  <Flex alignItems="center" gap={6} className={styles.topMeta}>
                    <Icon name="stock" size={14} />
                    <Text size="xs">❄️</Text>
                    <Text size="xs" bold>₪{price}</Text>
                    <Text size="xs" mode="sub">100 - 2</Text>
                    <Text size="xs" mode="sub">06:20</Text>
                </Flex> */}
                <ProductInline product={product} remove={false} note={false} admin />
            </Flex>

            <Flex col center gap={6} className={styles.successBlock}>
                <Flex alignItems="center" gap={8}>
                    <Text size="m" bold className={styles.successText}>{TR(isWeightPhase ? 'ops_please_weigh' : 'ops_scan_success')}</Text>
                    <span className={styles.checkCircle}><Icon name="check" size={14} /></span>
                </Flex>
                <Text size="s" mode="sub">{isWeightPhase ? TR('ops_enter_weight_supplied', { unit: unitLabel }) : TR('ops_enter_amount_supplied')}</Text>
            </Flex>

            <Flex className={styles.amountRow} alignItems="stretch">
                <Flex col center className={styles.orderedBox}>
                    <Text size="m" bold>{orderedLabel}</Text>
                    <Text size="xs" mode="sub">{TR('col_ordered')}</Text>
                </Flex>
                <Flex col center className={classNames(styles.suppliedBox, [styles.empty, isSuppliedEmpty], [styles.match, isMatch], [styles.warning, isWarning], [styles.error, isError])}>
                    <input
                        value={supplied}
                        onChange={e => setSupplied(limitDecimalInput(e.target.value, 3))}
                        placeholder="—"
                        className={styles.suppliedInput}
                        inputMode={weight ? 'decimal' : 'numeric'}
                        autoFocus
                    />
                    <Text size="xs" mode="sub">{TR('col_supplied')}{weight ? ` (${unitLabel})` : ''}</Text>
                </Flex>
            </Flex>

            {isWarning && (
                <Flex col center gap={4} className={styles.warningBlock}>
                    <Flex alignItems="center" gap={6} className={styles.warningText}>
                        <span className={styles.warnIcon}>⚠️</span>
                        <Text size="s" bold className={styles.warningYellow}>{TR('ops_amount_differs')}</Text>
                        <Icon name="bulb" size={18} className={styles.warnIconYellow} />
                    </Flex>
                    <Text size="xs" mode="sub">{TR('ops_verify_before_continue')}</Text>
                </Flex>
            )}
            {isError && (
                <Flex col center gap={4} className={styles.warningBlock}>
                    <Flex alignItems="center" gap={6} className={styles.warningText}>
                        <Text size="s" bold className={styles.warningRed}>{TR('ops_amount_exceeds_allowed')}</Text>
                        <span className={styles.errorIcon}>!</span>
                    </Flex>
                    {rangeLabel && <Text size="xs" mode="sub">{TR('ops_allowed_prefix', { amount: rangeLabel })}</Text>}
                    <Text size="xs" mode="sub">{TR('ops_fix_before_continue')}</Text>
                </Flex>
            )}

            <Flex center col gap={20} className={styles.actions}>
                {error && <Flex center><Text size="s" mode="error">{error}</Text></Flex>}
                <Button disabled={!canContinue} loading={loading} onClick={proceedWithFinalAmount} className={styles.continueBtn}>{TR('ops_continue_picking')}</Button>
                {resettable && <Button mode='text-brand' loading={resetLoading} onClick={handleReturnToPick}>ops_return_to_pick</Button>}
            </Flex>
        </Flex>
    }

    return <Flex col className={styles.scanProduct}>
        <FlowHeader
            title='ops_scan_product_title'
            onBack={onBack}
            onClose={onClose}
        />

        <Flex col className={styles.productSummary}>
            {/*  <Flex alignItems="center" gap={6} className={styles.topMeta}>
                <Icon name="stock" size={14} />
                <Text size="xs">❄️</Text>
                <Text size="xs" bold>₪{price}</Text>
                <Text size="xs" mode="sub">100 - 2</Text>
                <Text size="xs" mode="sub">06:20</Text>
            </Flex> */}
            <ProductInline product={product} remove={false} note={false} admin />
        </Flex>

        <Flex justifyContent="space-between" alignItems="center" className={styles.notScannedRow}>
            <Text size="s" bold>{TR('ops_product_not_scanned')}</Text>
            <Button mode="text" size="s" onClick={() => setManualMode(m => !m)}>{TR(manualMode ? 'ops_camera' : 'ops_manual_entry')}</Button>
        </Flex>
        {product.barcode && (
            <Flex center className={styles.notScannedRow}>
                <Text size="xs" mode="sub">{TR('ops_expected_barcode', { barcode: product.barcode })}</Text>
            </Flex>
        )}
        {mismatch && (
            <Flex col center gap={8} className={styles.warningBlock}>
                <Flex alignItems="center" gap={6} className={styles.warningText}>
                    <span className={styles.errorIcon}>!</span>
                    <Text size="s" bold className={styles.warningRed}>{TR('ops_barcode_mismatch')}</Text>
                </Flex>
                <Text size="xs" mode="sub">{TR('ops_scanned_expected', { scanned: mismatch, expected: product.barcode || '—' })}</Text>
                <Button size="s" onClick={handleRetryScan}>{TR('ops_scan_again')}</Button>
            </Flex>
        )}

        <Flex col className={styles.cameraWrap}>
            <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
            <div className={styles.overlay}>
                <span className={styles.corner + ' ' + styles.tl} />
                <span className={styles.corner + ' ' + styles.tr} />
                <span className={styles.corner + ' ' + styles.bl} />
                <span className={styles.corner + ' ' + styles.br} />
                {!scanning && <Flex center className={styles.scanningBadge}><Text size="s">{TR('ops_scanning')}</Text></Flex>}
            </div>
            {error && <Flex center className={styles.errorOverlay}><Text size="s" mode="error">{error}</Text></Flex>}
            {manualMode && (
                <Flex tag="form" onSubmit={handleManualSubmit} className={styles.manualForm}>
                    <input
                        value={manualBarcode}
                        onChange={e => setManualBarcode(e.target.value)}
                        placeholder={TR('ops_enter_barcode')}
                        className={styles.manualInput}
                        autoFocus
                    />
                    <Button type="submit" loading={loading} className={styles.manualBtn}>{TR('confirm')}</Button>
                </Flex>
            )}
        </Flex>

        <Flex col gap={10} className={styles.actions}>
            <Button mode="outline" loading={loading} onClick={onReplace || handleMissing} className={styles.missingBtn}>{TR('ops_missing_product')}</Button>
        </Flex>
    </Flex>
}
