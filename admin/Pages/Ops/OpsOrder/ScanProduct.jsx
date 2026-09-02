import { useEffect, useRef, useState } from 'react'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Button from 'common/components/Button'
import ProductInline from 'common/components/ProductInline'
import styles from './scanProduct.module.css'
import apiReq from 'common/functions/apiReq'
import classNames from 'common/functions/classNames'

export default function ScanProduct({ product = {}, orderId, onClose, onPicked, initialPhase, initialSupplied, initialBarcode }) {
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
    const [phase, setPhase] = useState(initialPhase || 'scanning') // scanning | amount
    const [scannedBarcode, setScannedBarcode] = useState(initialBarcode || '')
    const [supplied, setSupplied] = useState(initialSupplied != null ? String(initialSupplied) : '')

    const price = product.price ?? product.prices?.[0]?.price ?? 36
    const ordered = product.amount || 22

    const suppliedNum = supplied === '' ? null : Number(supplied)
    const isSuppliedEmpty = supplied === ''
    const isSuppliedValid = !isSuppliedEmpty && !isNaN(suppliedNum) && suppliedNum > 0
    const isMatch = isSuppliedValid && suppliedNum === ordered
    // red if exceeds ordered significantly or exceeds limit; for now > ordered
    const isExceeds = isSuppliedValid && suppliedNum > ordered
    const isDifferent = isSuppliedValid && suppliedNum !== ordered && !isExceeds
    // yellow warning when different but not exceeds
    const isWarning = isDifferent
    const isError = isExceeds
    const canContinue = isSuppliedValid && !isError

    async function proceedWithFinalAmount() {
        if (!canContinue || loading) return
        setLoading(true)
        setError('')
        try {
            const res = await apiReq('order/ops/pick_item', {
                id: orderId,
                barcode: scannedBarcode || product.barcode,
                action: 'scan',
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

    function handleScanned(scannedBarcodeValue) {
        // stop camera
        scanningRef.current = false
        setScanning(false)
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
        setScannedBarcode(scannedBarcodeValue)
        setSupplied('')
        setPhase('amount')
        setError('')
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
                    } catch {}
                    rafRef.current = requestAnimationFrame(loop)
                }
                rafRef.current = requestAnimationFrame(loop)
            } else {
                setManualMode(true)
            }
        } catch (err) {
            setError(err.message || 'לא ניתן להפעיל מצלמה')
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

    if (phase === 'amount') {
        return <Flex col className={styles.scanProduct}>
            <Flex center className={styles.header}>
                <Text size="m" bold>סריקת מוצר</Text>
            </Flex>

            <Flex col className={styles.productSummary}>
                <Flex alignItems="center" gap={6} className={styles.topMeta}>
                    <Icon name="stock" size={14} />
                    <Text size="xs">❄️</Text>
                    <Text size="xs" bold>₪{price}</Text>
                    <Text size="xs" mode="sub">100 - 2</Text>
                    <Text size="xs" mode="sub">06:20</Text>
                </Flex>
            <ProductInline product={product} remove={false} note={false} admin />
            </Flex>

            <Flex col center gap={6} className={styles.successBlock}>
                <Flex alignItems="center" gap={8}>
                    <Text size="m" bold className={styles.successText}>מוצר נסרק בהצלחה!</Text>
                    <span className={styles.checkCircle}><Icon name="check" size={14} /></span>
                </Flex>
                <Text size="s" mode="sub">נא להזין כמות שסופקה</Text>
            </Flex>

            <Flex className={styles.amountRow} alignItems="stretch">
                <Flex col center className={styles.orderedBox}>
                    <Text size="m" bold>{ordered} <Text size="xs">יח'</Text></Text>
                    <Text size="xs" mode="sub">הוזמן</Text>
                </Flex>
                <Flex col center className={classNames(styles.suppliedBox, [styles.empty, isSuppliedEmpty], [styles.match, isMatch], [styles.warning, isWarning], [styles.error, isError])}>
                    <input
                        value={supplied}
                        onChange={e => setSupplied(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="—"
                        className={styles.suppliedInput}
                        inputMode="numeric"
                        autoFocus
                    />
                    <Text size="xs" mode="sub">סופק</Text>
                </Flex>
            </Flex>

            {isWarning && (
                <Flex col center gap={4} className={styles.warningBlock}>
                    <Flex alignItems="center" gap={6} className={styles.warningText}>
                        <span className={styles.warnIcon}>⚠️</span>
                        <Text size="s" bold className={styles.warningYellow}>הכמות שהוזנה שונה מהכמות שהוזמנה</Text>
                        <Icon name="bulb" size={18} className={styles.warnIconYellow} />
                    </Flex>
                    <Text size="xs" mode="sub">נא לוודא לפני המשך הליקוט</Text>
                </Flex>
            )}
            {isError && (
                <Flex col center gap={4} className={styles.warningBlock}>
                    <Flex alignItems="center" gap={6} className={styles.warningText}>
                        <Text size="s" bold className={styles.warningRed}>הכמות שהוזנה חורגת מהמותר</Text>
                        <span className={styles.errorIcon}>!</span>
                    </Flex>
                    <Text size="xs" mode="sub">נא לתקן לפני המשך ליקוט</Text>
                </Flex>
            )}

            <Flex col gap={10} className={styles.actions}>
                <Button disabled={!canContinue} loading={loading} onClick={proceedWithFinalAmount} className={styles.continueBtn}>המשך ליקוט</Button>
            </Flex>
        </Flex>
    }

    return <Flex col className={styles.scanProduct}>
        <Flex center className={styles.header}>
            <Text size="m" bold>סריקת מוצר</Text>
        </Flex>

        <Flex col className={styles.productSummary}>
            <Flex alignItems="center" gap={6} className={styles.topMeta}>
                <Icon name="stock" size={14} />
                <Text size="xs">❄️</Text>
                <Text size="xs" bold>₪{price}</Text>
                <Text size="xs" mode="sub">100 - 2</Text>
                <Text size="xs" mode="sub">06:20</Text>
            </Flex>
            <ProductInline product={product} remove={false} note={false} admin />
        </Flex>

        <Flex justifyContent="space-between" alignItems="center" className={styles.notScannedRow}>
            <Text size="s" bold>מוצר לא נסרק?</Text>
            <Button mode="text" size="s" onClick={() => setManualMode(m => !m)}>{manualMode ? 'מצלמה' : 'הזנה ידנית'}</Button>
        </Flex>

        <Flex col className={styles.cameraWrap}>
            <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
            <div className={styles.overlay}>
                <span className={styles.corner + ' ' + styles.tl} />
                <span className={styles.corner + ' ' + styles.tr} />
                <span className={styles.corner + ' ' + styles.bl} />
                <span className={styles.corner + ' ' + styles.br} />
                {!scanning && <Flex center className={styles.scanningBadge}><Text size="s">סורק...</Text></Flex>}
            </div>
            {error && <Flex center className={styles.errorOverlay}><Text size="s" mode="error">{error}</Text></Flex>}
            {manualMode && (
                <Flex tag="form" onSubmit={handleManualSubmit} className={styles.manualForm}>
                    <input
                        value={manualBarcode}
                        onChange={e => setManualBarcode(e.target.value)}
                        placeholder="הקלד ברקוד"
                        className={styles.manualInput}
                        autoFocus
                    />
                    <Button type="submit" loading={loading} className={styles.manualBtn}>אישור</Button>
                </Flex>
            )}
        </Flex>

        <Flex col gap={10} className={styles.actions}>
            <Button mode="outline" loading={loading} onClick={handleMissing} className={styles.missingBtn}>מוצר חסר</Button>
        </Flex>
    </Flex>
}
