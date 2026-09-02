import { useEffect, useState } from 'react'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Loader from 'common/components/Loader'
import apiReq from 'common/functions/apiReq'
import { useOrder } from 'features/Order/OrderProvider'
import Collapse from 'common/components/Collapse'
import { IoCloseOutline, IoCheckmarkCircleOutline } from 'react-icons/io5'
import { LuTicketPercent, LuTag, LuTags } from 'react-icons/lu'
import { RiCoupon2Line } from 'react-icons/ri'
import styles from './couponSection.module.css'
import summaryStyles from '../orderSummary.module.css'

function formatDiscount(coupon) {
    if (!coupon) return ''
    if (coupon.benefit === 'percent') return `${coupon.discount}%`
    return `₪${Number(coupon.discount).toFixed(0)}`
}

function formatMinSum(minSum) {
    if (!minSum) return null
    return `בקנייה מעל ₪${Number(minSum).toFixed(0)}`
}

function formatExpiry(end) {
    if (!end) return null
    try {
        const d = new Date(end)
        if (isNaN(d)) return null
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yy = d.getFullYear()
        return `בתוקף עד: ${dd}.${mm}.${yy}`
    } catch { return null }
}

// Reusable card shell — used for regular coupons now, sale coupons later.
// Keeps same outer structure (dashed border, footer, CTA) so both types sit in same grid.
function RegularCouponCard({ coupon, isApplied, isLoading, onApply, onRemove }) {
    const discountLabel = formatDiscount(coupon)
    const minSumLabel = formatMinSum(coupon.minSum)
    const expiryLabel = formatExpiry(coupon.end)

    return (
        <div className={`${styles.couponCard} ${styles.regularCard} ${isApplied ? styles.applied : ''}`}>
            <div className={styles.cardTop}>
                <div className={styles.cardIconCircle}>
                    <LuTag className={styles.cardIcon} />
                </div>
                <Text bold size='l' className={styles.discountValue}>{discountLabel} הנחה</Text>
                {minSumLabel && <Text size='s' mode='sub' className={styles.minSum}>{minSumLabel}</Text>}
            </div>

            <div className={styles.cardBody}>
                <Text bold size='s' className={styles.cardName}>{coupon.name}</Text>
                {coupon.description && (
                    <Text size='s' mode='sub' className={styles.cardDesc}>{coupon.description}</Text>
                )}
            </div>

            <button
                type='button'
                className={`${styles.cardCta} ${isApplied ? styles.ctaApplied : ''}`}
                onClick={isApplied ? onRemove : onApply}
                disabled={isLoading}
            >
                {isLoading ? <Loader size={14} /> : isApplied ? (
                    <><IoCheckmarkCircleOutline /> מופעל</>
                ) : (
                    <><LuTicketPercent /> החל קופון</>
                )}
            </button>

            {expiryLabel && (
                <div className={styles.cardFooter}>
                    <Text size='s' mode='sub' className={styles.expiry}>{expiryLabel}</Text>
                    {coupon.maxSum && (
                        <Text size='s' mode='sub' className={styles.expiry}>עד ₪{Number(coupon.maxSum).toFixed(0)}</Text>
                    )}
                </div>
            )}
        </div>
    )
}

// Placeholder for future sale coupons — same shell, different inner content.
// Keeping file structure ready so sale type can be plugged without layout shift.
function SaleCouponCard({ coupon, isApplied, isLoading, onApply, onRemove }) {
    // For now renders same as regular if a sale coupon somehow arrives.
    // Intentionally separate component for future product-image layout.
    return <RegularCouponCard coupon={coupon} isApplied={isApplied} isLoading={isLoading} onApply={onApply} onRemove={onRemove} />
}

function CouponCard({ coupon, isApplied, isLoading, onApply, onRemove }) {
    if (coupon.sale) return <SaleCouponCard coupon={coupon} isApplied={isApplied} isLoading={isLoading} onApply={onApply} onRemove={onRemove} />
    return <RegularCouponCard coupon={coupon} isApplied={isApplied} isLoading={isLoading} onApply={onApply} onRemove={onRemove} />
}

export default function CouponSection() {
    const { order = {}, setOrder } = useOrder()
    const appliedCode = (order.coupons?.[0]?.code || '').toLowerCase()
    const [coupons, setCoupons] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const [inputValue, setInputValue] = useState(appliedCode ? appliedCode.toUpperCase() : '')
    const [inputLoading, setInputLoading] = useState(false)
    const [inputError, setInputError] = useState(null)
    const [cardLoadingCode, setCardLoadingCode] = useState(null)
    const [isEditing, setIsEditing] = useState(!appliedCode)

    // keep input in sync when order changes externally
    useEffect(() => {
        const code = (order.coupons?.[0]?.code || '').toLowerCase()
        if (code) setInputValue(code.toUpperCase())
        else if (!inputLoading) {
            // don't overwrite while user is typing if no applied coupon
        }
    }, [appliedCode]) // eslint-disable-line

    // input open when no coupon, closed (edit button) when coupon exists
    useEffect(() => {
        if (appliedCode) setIsEditing(false)
        else setIsEditing(true)
    }, [appliedCode])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        apiReq('user/coupon', {})
            .then(res => {
                if (cancelled) return
                const list = res?.coupons || res || []
                setCoupons(Array.isArray(list) ? list : [])
            })
            .catch(e => {
                if (cancelled) return
                setError(e?.message || e)
                setCoupons([])
            })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [])

    async function handleApplyCode(codeRaw) {
        const code = (codeRaw || '').trim().toLowerCase()
        if (!code) { setInputError('נא להזין קוד קופון'); return }
        if (appliedCode === code) return
        setInputError(null)
        // if another coupon already applied, remove it first (server only allows one)
        const isReplace = !!appliedCode
        const loaderCode = code
        setCardLoadingCode(loaderCode)
        setInputLoading(true)
        try {
            if (isReplace) {
                try { await apiReq('order/coupon/remove', { couponCode: appliedCode }) } catch { /* ignore */ }
            }
            const updated = await apiReq('order/coupon/add', { couponCode: code })
            // updated is filtered order
            if (updated?.id || updated?.coupons) {
                setOrder(prev => ({ ...prev, ...updated }))
            } else if (updated) {
                setOrder(prev => ({ ...prev, ...updated }))
            }
            setInputValue(code.toUpperCase())
        } catch (e) {
            const msg = typeof e === 'string' ? e : (e?.message || e?.details?.reason || 'שגיאה בהפעלת הקופון')
            setInputError(msg)
        } finally {
            setInputLoading(false)
            setCardLoadingCode(null)
        }
    }

    async function handleRemoveCode(codeRaw) {
        const code = (codeRaw || appliedCode || '').trim().toLowerCase()
        if (!code) return
        setInputError(null)
        setInputLoading(true)
        setCardLoadingCode(code)
        try {
            const updated = await apiReq('order/coupon/remove', { couponCode: code })
            if (updated?.id !== undefined || updated?.coupons !== undefined) {
                setOrder(prev => ({ ...prev, ...updated, coupons: updated.coupons || [] }))
            } else {
                setOrder(prev => ({ ...prev, coupons: [] }))
            }
            setInputValue('')
        } catch (e) {
            const msg = typeof e === 'string' ? e : (e?.message || 'שגיאה בהסרת הקופון')
            setInputError(msg)
        } finally {
            setInputLoading(false)
            setCardLoadingCode(null)
        }
    }

    function handleCardApply(coupon) {
        if (appliedCode === coupon.code.toLowerCase()) {
            handleRemoveCode(coupon.code)
        } else {
            handleApplyCode(coupon.code)
        }
    }

    if (loading) {
        return (
            <Flex center className={styles.loadingWrap}>
                <Loader size={18} />
            </Flex>
        )
    }
    const hasCoupons = coupons && coupons.length > 0
    return (
        <Flex col gap={12} className={styles.couponSection}>
            {hasCoupons && (
                <div className={styles.couponGrid}>
                    {coupons.map(c => (
                        <CouponCard
                            key={c.code}
                            coupon={c}
                            isApplied={appliedCode === c.code.toLowerCase()}
                            isLoading={cardLoadingCode === c.code.toLowerCase() || (inputLoading && appliedCode !== c.code.toLowerCase() && false)}
                            onApply={() => handleCardApply(c)}
                            onRemove={() => handleRemoveCode(c.code)}
                        />
                    ))}
                </div>
            )}

            <div className={styles.inputRow}>
                {appliedCode && !isEditing ? (
                    <button
                        type='button'
                        className={styles.editLabelBtn}
                        onClick={() => setIsEditing(true)}
                    >
                        <Text size='s' bold className={styles.editLabel}>ערוך קופון</Text>
                    </button>
                ) : (
                    <div className={styles.editLabelSpacer} />
                )}

                {isEditing ? (
                    <div className={styles.inputPillWrap}>
                        <input
                            id='checkout-coupon-input'
                            className={styles.couponInput}
                            value={inputValue}
                            onChange={e => { setInputValue(e.target.value.toUpperCase()); setInputError(null) }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (appliedCode && inputValue.trim().toLowerCase() === appliedCode) {
                                        handleRemoveCode(inputValue)
                                    } else {
                                        handleApplyCode(inputValue)
                                    }
                                }
                                if (e.key === 'Escape' && appliedCode) setIsEditing(false)
                            }}
                            placeholder='הזן קוד קופון'
                            disabled={inputLoading}
                            autoComplete='off'
                            spellCheck={false}
                            autoFocus={!appliedCode}
                        />
                        {inputLoading ? (
                            <Loader size={14} />
                        ) : inputValue ? (
                            <button
                                type='button'
                                className={styles.clearBtn}
                                onClick={() => {
                                    if (appliedCode && inputValue.trim().toLowerCase() === appliedCode) {
                                        handleRemoveCode(inputValue)
                                    } else {
                                        setInputValue('')
                                        setInputError(null)
                                    }
                                }}
                                aria-label='clear'
                            >
                                <IoCloseOutline />
                            </button>
                        ) : null}
                        {!inputLoading && inputValue && appliedCode !== inputValue.trim().toLowerCase() && (
                            <button type='button' className={styles.applyBtn} onClick={() => handleApplyCode(inputValue)}>
                                החל
                            </button>
                        )}
                        {appliedCode && inputValue.trim().toLowerCase() === appliedCode && !inputLoading && (
                            <button type='button' className={styles.removeBtn} onClick={() => handleRemoveCode(inputValue)}>
                                הסר
                            </button>
                        )}
                        {appliedCode && (
                            <button type='button' className={styles.cancelEditBtn} onClick={() => setIsEditing(false)}>
                                ביטול
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={styles.couponPillDisplay} onClick={() => setIsEditing(true)} role='button' tabIndex={0}>
                        <span className={styles.couponPillText}>{appliedCode.toUpperCase()}</span>
                    </div>
                )}
                <RiCoupon2Line className={styles.couponRowIcon} />
            </div>
            {inputError && <Text size='s' mode='error' className={styles.inputError}>{inputError}</Text>}
            {appliedCode && !isEditing && (
                <Text size='s' mode='sub' className={styles.appliedHint}>קופון פעיל: {appliedCode.toUpperCase()}</Text>
            )}
        </Flex>
    )
}

// Hook for parent to know whether to render the Collapse wrapper
export function useAvailableCoupons() {
    const [hasCoupons, setHasCoupons] = useState(null)
    useEffect(() => {
        let cancelled = false
        apiReq('user/coupon', {})
            .then(res => {
                if (cancelled) return
                const list = res?.coupons || res || []
                setHasCoupons(Array.isArray(list) && list.length > 0)
            })
            .catch(() => { if (!cancelled) setHasCoupons(false) })
        return () => { cancelled = true }
    }, [])
    return hasCoupons
}

// Wrapper that includes the Collapse header — always visible so manual coupon entry works.
// Grid of personalized coupons is shown only when GET returns relevant coupons; input stays visible in all cases.
export function CouponCollapse({ defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen)
    const [coupons, setCoupons] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        apiReq('user/coupon', {})
            .then(res => {
                if (cancelled) return
                const list = res?.coupons || res || []
                setCoupons(Array.isArray(list) ? list : [])
            })
            .catch(() => { if (!cancelled) setCoupons([]) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [])

    if (loading) {
        return (
            <Collapse
                open={open}
                onToggle={setOpen}
                className={summaryStyles.summaryCollapse}
                title={
                    <Flex alignItems='center' gap={12}>
                        <div className={summaryStyles.iconCircle}>
                            <LuTicketPercent className={summaryStyles.rowIcon} />
                        </div>
                        <Text bold size='s' className={summaryStyles.rowText}>coupons_especially_for_you</Text>
                    </Flex>
                }
            >
                <Flex center className={styles.loadingWrap}><Loader size={18} /></Flex>
            </Collapse>
        )
    }
    // Always render the collapse — input must stay visible even when no personalized coupons.
    // Grid is shown only if GET returned relevant coupons; input is shown in all cases.

    return (
        <Collapse
            open={open}
            onToggle={setOpen}
            className={summaryStyles.summaryCollapse}
            title={
                <Flex alignItems='center' gap={12}>
                    <div className={summaryStyles.iconCircle}>
                        <LuTags className={summaryStyles.rowIcon} />
                    </div>
                    <Text bold size='s' className={summaryStyles.rowText}>coupons_especially_for_you</Text>
                </Flex>
            }
        >
            <CouponSectionInner coupons={coupons} />
        </Collapse>
    )
}

// Inner version that receives pre-fetched coupons — avoids double fetch when used via CouponCollapse
function CouponSectionInner({ coupons: initialCoupons }) {
    const { order = {}, setOrder } = useOrder()
    const appliedCode = (order.coupons?.[0]?.code || '').toLowerCase()
    const [coupons] = useState(initialCoupons)
    const [inputValue, setInputValue] = useState(appliedCode ? appliedCode.toUpperCase() : '')
    const [inputLoading, setInputLoading] = useState(false)
    const [inputError, setInputError] = useState(null)
    const [cardLoadingCode, setCardLoadingCode] = useState(null)
    const [isEditing, setIsEditing] = useState(!appliedCode)

    useEffect(() => {
        const code = (order.coupons?.[0]?.code || '').toLowerCase()
        if (code) setInputValue(code.toUpperCase())
    }, [appliedCode])

    useEffect(() => {
        if (appliedCode) setIsEditing(false)
        else setIsEditing(true)
    }, [appliedCode])

    async function handleApplyCode(codeRaw) {
        const code = (codeRaw || '').trim().toLowerCase()
        if (!code) { setInputError('נא להזין קוד קופון'); return }
        if (appliedCode === code) return
        setInputError(null)
        const isReplace = !!appliedCode
        setCardLoadingCode(code)
        setInputLoading(true)
        try {
            if (isReplace) { try { await apiReq('order/coupon/remove', { couponCode: appliedCode }) } catch { } }
            const updated = await apiReq('order/coupon/add', { couponCode: code })
            if (updated) setOrder(prev => ({ ...prev, ...updated }))
            setInputValue(code.toUpperCase())
        } catch (e) {
            const msg = typeof e === 'string' ? e : (e?.message || e?.details?.reason || 'שגיאה בהפעלת הקופון')
            setInputError(msg)
        } finally { setInputLoading(false); setCardLoadingCode(null) }
    }
    async function handleRemoveCode(codeRaw) {
        const code = (codeRaw || appliedCode || '').trim().toLowerCase()
        if (!code) return
        setInputError(null); setInputLoading(true); setCardLoadingCode(code)
        try {
            const updated = await apiReq('order/coupon/remove', { couponCode: code })
            if (updated) setOrder(prev => ({ ...prev, ...updated, coupons: updated.coupons || [] }))
            else setOrder(prev => ({ ...prev, coupons: [] }))
            setInputValue('')
        } catch (e) {
            const msg = typeof e === 'string' ? e : (e?.message || 'שגיאה בהסרת הקופון')
            setInputError(msg)
        } finally { setInputLoading(false); setCardLoadingCode(null) }
    }
    function handleCardApply(coupon) {
        if (appliedCode === coupon.code.toLowerCase()) handleRemoveCode(coupon.code)
        else handleApplyCode(coupon.code)
    }
    return (
        <Flex col gap={12} className={styles.couponSection}>
            {coupons && coupons.length > 0 && (
                <div className={styles.couponGrid}>
                    {coupons.map(c => (
                        <CouponCard
                            key={c.code}
                            coupon={c}
                            isApplied={appliedCode === c.code.toLowerCase()}
                            isLoading={cardLoadingCode === c.code.toLowerCase()}
                            onApply={() => handleCardApply(c)}
                            onRemove={() => handleRemoveCode(c.code)}
                        />
                    ))}
                </div>
            )}
            <div className={styles.inputRow}>
                <LuTicketPercent className={styles.couponRowIcon} />

                {isEditing ? (
                    <div className={styles.inputPillWrap}>
                        <input
                            id='checkout-coupon-input-inner'
                            className={styles.couponInput}
                            value={inputValue}
                            onChange={e => { setInputValue(e.target.value.toUpperCase()); setInputError(null) }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (appliedCode && inputValue.trim().toLowerCase() === appliedCode) handleRemoveCode(inputValue)
                                    else handleApplyCode(inputValue)
                                }
                                if (e.key === 'Escape' && appliedCode) setIsEditing(false)
                            }}
                            placeholder='הזן קוד קופון'
                            disabled={inputLoading}
                            autoComplete='off'
                            spellCheck={false}
                            autoFocus
                        />
                        {inputLoading ? <Loader size={14} /> : inputValue ? (
                            <button type='button' className={styles.clearBtn} onClick={() => {
                                if (appliedCode && inputValue.trim().toLowerCase() === appliedCode) handleRemoveCode(inputValue)
                                else { setInputValue(''); setInputError(null) }
                            }} aria-label='clear'><IoCloseOutline /></button>
                        ) : null}
                        {!inputLoading && inputValue && appliedCode !== inputValue.trim().toLowerCase() && (
                            <button type='button' className={styles.applyBtn} onClick={() => handleApplyCode(inputValue)}>החל</button>
                        )}
                        {appliedCode && inputValue.trim().toLowerCase() === appliedCode && !inputLoading && (
                            <button type='button' className={styles.removeBtn} onClick={() => handleRemoveCode(inputValue)}>הסר</button>
                        )}
                        {appliedCode && (
                            <button type='button' className={styles.cancelEditBtn} onClick={() => setIsEditing(false)}>
                                ביטול
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={styles.couponPillDisplay} onClick={() => setIsEditing(true)} role='button' tabIndex={0}>
                        <span className={styles.couponPillText}>{appliedCode.toUpperCase()}</span>
                    </div>
                )}
            </div>
            {inputError && <Text size='s' mode='error' className={styles.inputError}>{inputError}</Text>}
        </Flex>
    )
}
